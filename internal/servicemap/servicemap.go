// Package servicemap is the service-map module backend (B10 #54). It persists an
// uploaded services.yaml in a ConfigMap and validates it server-side against the
// exact rules the UI applies client-side (see validate.go and
// web/src/modules/servicemap/parse.ts).
//
// Surface under /api/servicemap:
//   - GET: return the stored, parsed model; an absent ConfigMap/key yields the
//     empty model {"name":"","services":[]} (200, not 404 — the UI expects it).
//   - PUT: read the raw uploaded YAML (capped at 1 MiB), validate it, and on
//     success write it verbatim into the ConfigMap, returning the parsed model.
//     Malformed YAML → 400; validation failure → 422 with the errors list.
//
// The ConfigMap is read/written AS THE LOGGED-IN USER (forwarded token) via
// k8s.UserClientset, so RBAC is enforced upstream by the apiserver. Under --mock
// (or any accessor with no typed client and no token) it falls back to a
// mutex-guarded in-memory store so the module works without a cluster.
//
// Node→workload binding and live health (#55) are NOT built here: U9's UI derives
// them client-side over the generic /api/stream.
package servicemap

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"sync"

	corev1 "k8s.io/api/core/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	"github.com/aimemalaika/Kestrel/internal/k8s"
)

// dataKey is the fixed ConfigMap data key the raw services.yaml is stored under.
const dataKey = "services.yaml"

// maxBody caps the uploaded YAML (service maps are small; 1 MiB is generous and
// matches the apply/can-i hardening posture). An oversize body is a clean 413.
const maxBody = 1 << 20 // 1 MiB

// Config names the ConfigMap the service map is persisted in.
type Config struct {
	Namespace string
	Name      string
}

// Handler serves GET/PUT /api/servicemap backed by a ConfigMap (read/written as
// the user) with an in-memory fallback when no typed client is available.
type Handler struct {
	acc k8s.ClusterAccessor
	cfg Config

	mu  sync.Mutex
	mem []byte // in-memory fallback store (nil clientset, e.g. --mock)
}

// NewHandler builds the service-map HTTP handler over a cluster accessor.
func NewHandler(acc k8s.ClusterAccessor, cfg Config) *Handler {
	return &Handler{acc: acc, cfg: cfg}
}

func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		h.get(w, r)
	case http.MethodPut:
		h.put(w, r)
	default:
		w.Header().Set("Allow", "GET, PUT")
		writeErr(w, errf(http.StatusMethodNotAllowed, "MethodNotAllowed", "%s not allowed on %s", r.Method, r.URL.Path))
	}
}

func (h *Handler) get(w http.ResponseWriter, r *http.Request) {
	raw, err := h.load(r.Context())
	if err != nil {
		writeErr(w, err)
		return
	}
	if len(raw) == 0 {
		writeJSON(w, http.StatusOK, emptyModel())
		return
	}
	// Prefer the stored, already-validated model. If the stored YAML somehow fails
	// to parse or validate, return the empty map and log rather than 500ing.
	model, verrs, perr := validate(raw)
	if perr != nil || model == nil {
		slog.Warn("servicemap: stored YAML failed to parse/validate; returning empty map",
			slog.Any("parseError", perr), slog.Int("validationErrors", len(verrs)))
		writeJSON(w, http.StatusOK, emptyModel())
		return
	}
	writeJSON(w, http.StatusOK, model)
}

func (h *Handler) put(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, maxBody)
	raw, err := io.ReadAll(r.Body)
	if err != nil {
		var mbe *http.MaxBytesError
		if errors.As(err, &mbe) {
			writeErr(w, errf(http.StatusRequestEntityTooLarge, "RequestEntityTooLarge", "request body exceeds the limit of 1 MiB"))
			return
		}
		writeErr(w, errf(http.StatusBadRequest, "BadRequest", "could not read request body: %v", err))
		return
	}

	model, verrs, perr := validate(raw)
	if perr != nil {
		writeErr(w, errf(http.StatusBadRequest, "BadRequest", "invalid YAML: %v", perr))
		return
	}
	if len(verrs) > 0 {
		writeJSON(w, http.StatusUnprocessableEntity, map[string]any{
			"error":  "service map validation failed",
			"code":   http.StatusUnprocessableEntity,
			"reason": "Invalid",
			"errors": verrs,
		})
		return
	}

	if err := h.store(r.Context(), raw); err != nil {
		writeErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, model)
}

// ---- storage (ConfigMap as the user, or in-memory fallback) ----------------

// load returns the stored raw YAML, or nil if nothing is stored. An absent
// ConfigMap or missing key is treated as empty (not an error).
func (h *Handler) load(ctx context.Context) ([]byte, error) {
	kube, err := k8s.UserClientset(ctx, h.acc)
	if err != nil {
		return nil, errf(http.StatusInternalServerError, "InternalError", "could not build a Kubernetes client: %v", err)
	}
	if kube == nil {
		h.mu.Lock()
		defer h.mu.Unlock()
		return append([]byte(nil), h.mem...), nil
	}
	cm, gerr := kube.CoreV1().ConfigMaps(h.cfg.Namespace).Get(ctx, h.cfg.Name, metav1.GetOptions{})
	if apierrors.IsNotFound(gerr) {
		return nil, nil
	}
	if gerr != nil {
		return nil, mapK8sErr(gerr)
	}
	return []byte(cm.Data[dataKey]), nil
}

// store writes the raw YAML into the ConfigMap, creating it if absent and
// updating it (last-writer-wins) if present. With no typed client it stores to
// the in-memory fallback.
func (h *Handler) store(ctx context.Context, raw []byte) error {
	kube, err := k8s.UserClientset(ctx, h.acc)
	if err != nil {
		return errf(http.StatusInternalServerError, "InternalError", "could not build a Kubernetes client: %v", err)
	}
	if kube == nil {
		h.mu.Lock()
		h.mem = append([]byte(nil), raw...)
		h.mu.Unlock()
		return nil
	}
	cms := kube.CoreV1().ConfigMaps(h.cfg.Namespace)
	existing, gerr := cms.Get(ctx, h.cfg.Name, metav1.GetOptions{})
	if apierrors.IsNotFound(gerr) {
		cm := &corev1.ConfigMap{
			ObjectMeta: metav1.ObjectMeta{Name: h.cfg.Name, Namespace: h.cfg.Namespace},
			Data:       map[string]string{dataKey: string(raw)},
		}
		if _, cerr := cms.Create(ctx, cm, metav1.CreateOptions{}); cerr != nil {
			return mapK8sErr(cerr)
		}
		return nil
	}
	if gerr != nil {
		return mapK8sErr(gerr)
	}
	if existing.Data == nil {
		existing.Data = map[string]string{}
	}
	existing.Data[dataKey] = string(raw)
	if _, uerr := cms.Update(ctx, existing, metav1.UpdateOptions{}); uerr != nil {
		return mapK8sErr(uerr)
	}
	return nil
}

func emptyModel() Model { return Model{Name: "", Services: []ServiceNode{}} }
