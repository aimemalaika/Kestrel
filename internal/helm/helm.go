// Package helm is a read-only Helm module backend. It exposes a small HTTP
// surface under /api/helm that the helm module UI consumes:
//
//   - releases: list/decode Helm v3 releases straight from their
//     `helm.sh/release.v1` Secrets, AS THE LOGGED-IN USER (the user's forwarded
//     token is used to build a per-user clientset, so RBAC is enforced upstream
//     by the apiserver). No Helm Go SDK: the release Secrets are decoded
//     directly (base64 → gzip → JSON).
//   - chart repos: list operator-configured chart repositories and their
//     charts, served from each repo's index.yaml over plain HTTP (NOT per-user;
//     repo config is operator-level, not cluster RBAC).
//
// Namespace/name for release detail arrive as query params (not path segments)
// to avoid path-escaping pitfalls, mirroring the registry module.
package helm

import (
	"bytes"
	"compress/gzip"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"sort"
	"strings"
	"time"

	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"sigs.k8s.io/yaml"

	"github.com/aimemalaika/Kestrel/internal/k8s"
)

// helmReleaseSecretType is the Secret type Helm v3 writes its release state as.
const helmReleaseSecretType = "helm.sh/release.v1"

// ownerSelector selects Helm v3 release Secrets (label owner=helm).
const ownerSelector = "owner=helm"

// Config is the helm module configuration (plumbed from flags).
type Config struct {
	// Repos are the operator-configured chart repositories.
	Repos []ChartRepo
}

// Release is the list shape the UI consumes (web/src/modules/helm/HelmClient.ts).
type Release struct {
	Name         string `json:"name"`
	Namespace    string `json:"namespace"`
	Revision     int    `json:"revision"`
	Status       string `json:"status"`
	Chart        string `json:"chart"`
	ChartVersion string `json:"chartVersion"`
	AppVersion   string `json:"appVersion"`
	Updated      string `json:"updated"` // RFC3339
}

// ReleaseDetail extends Release with the heavier decoded fields.
type ReleaseDetail struct {
	Release
	Values          string `json:"values"`          // user config rendered as YAML
	Notes           string `json:"notes"`           // info.notes
	ManifestSummary string `json:"manifestSummary"` // "Deployment x1, Service x2"
}

// ChartRepo is one configured chart repository.
type ChartRepo struct {
	Name string `json:"name"`
	URL  string `json:"url"`
}

// Chart is one chart (latest version) in a repo's index.
type Chart struct {
	Name        string `json:"name"`
	Version     string `json:"version"`
	Description string `json:"description"`
}

// Handler serves the /api/helm/* routes. Releases are read per-user through the
// accessor; chart repos come from static config.
type Handler struct {
	acc   k8s.ClusterAccessor
	repos []ChartRepo
	hc    *http.Client
}

// NewHandler builds the helm HTTP handler over a cluster accessor and config.
func NewHandler(acc k8s.ClusterAccessor, cfg Config) *Handler {
	repos := cfg.Repos
	if repos == nil {
		repos = []ChartRepo{}
	}
	return &Handler{
		acc:   acc,
		repos: repos,
		hc:    &http.Client{Timeout: 30 * time.Second},
	}
}

// ---- HTTP routing ---------------------------------------------------------

func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	rest := strings.TrimPrefix(r.URL.Path, "/api/helm")
	rest = strings.Trim(rest, "/")
	switch rest {
	case "releases":
		h.only(w, r, http.MethodGet, h.listReleases)
	case "releases/detail":
		h.only(w, r, http.MethodGet, h.getRelease)
	case "repos":
		h.only(w, r, http.MethodGet, h.listRepos)
	case "charts":
		h.only(w, r, http.MethodGet, h.listCharts)
	default:
		writeErr(w, errf(http.StatusNotFound, "NotFound", "unknown helm path %s", r.URL.Path))
	}
}

func (h *Handler) only(w http.ResponseWriter, r *http.Request, method string, fn http.HandlerFunc) {
	if r.Method != method {
		w.Header().Set("Allow", method)
		writeErr(w, errf(http.StatusMethodNotAllowed, "MethodNotAllowed", "%s not allowed on %s", r.Method, r.URL.Path))
		return
	}
	fn(w, r)
}

// ---- releases (as the user) -----------------------------------------------

func (h *Handler) listReleases(w http.ResponseWriter, r *http.Request) {
	kube, err := k8s.UserClientset(r.Context(), h.acc)
	if err != nil {
		writeErr(w, errf(http.StatusInternalServerError, "InternalError", "could not build a Kubernetes client: %v", err))
		return
	}
	if kube == nil {
		// --mock / no typed client (e.g. Stub accessor): nothing to list rather
		// than a panic. Releases need a real cluster.
		writeJSON(w, http.StatusOK, []Release{})
		return
	}
	secrets, err := kube.CoreV1().Secrets("").List(r.Context(), metav1.ListOptions{LabelSelector: ownerSelector})
	if err != nil {
		writeErr(w, mapK8sErr(err))
		return
	}
	// Group by (namespace, release name), keeping the highest revision.
	type key struct{ ns, name string }
	best := map[key]*release{}
	for i := range secrets.Items {
		s := &secrets.Items[i]
		rel, derr := decodeReleaseSecret(s.Data["release"])
		if derr != nil {
			// Never fail the whole list on one bad secret: skip and log.
			log.Printf("helm: skipping release secret %s/%s: %v", s.Namespace, s.Name, derr)
			continue
		}
		ns := rel.Namespace
		if ns == "" {
			ns = s.Namespace
		}
		k := key{ns: ns, name: rel.Name}
		if cur, ok := best[k]; !ok || rel.Version > cur.Version {
			best[k] = rel
		}
	}
	out := make([]Release, 0, len(best))
	for k, rel := range best {
		out = append(out, toRelease(rel, k.ns))
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Namespace != out[j].Namespace {
			return out[i].Namespace < out[j].Namespace
		}
		return out[i].Name < out[j].Name
	})
	writeJSON(w, http.StatusOK, out)
}

func (h *Handler) getRelease(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	ns, name := q.Get("namespace"), q.Get("name")
	if ns == "" || name == "" {
		writeErr(w, errf(http.StatusBadRequest, "BadRequest", "missing required query params: namespace and name"))
		return
	}
	if !validName(ns) {
		writeErr(w, errf(http.StatusBadRequest, "BadRequest", "invalid namespace: %q", ns))
		return
	}
	if !validName(name) {
		writeErr(w, errf(http.StatusBadRequest, "BadRequest", "invalid name: %q", name))
		return
	}
	kube, err := k8s.UserClientset(r.Context(), h.acc)
	if err != nil {
		writeErr(w, errf(http.StatusInternalServerError, "InternalError", "could not build a Kubernetes client: %v", err))
		return
	}
	if kube == nil {
		writeErr(w, errf(http.StatusNotFound, "NotFound", "release %q not found in %q", name, ns))
		return
	}
	sel := ownerSelector + ",name=" + name
	secrets, err := kube.CoreV1().Secrets(ns).List(r.Context(), metav1.ListOptions{LabelSelector: sel})
	if err != nil {
		writeErr(w, mapK8sErr(err))
		return
	}
	var best *release
	for i := range secrets.Items {
		s := &secrets.Items[i]
		rel, derr := decodeReleaseSecret(s.Data["release"])
		if derr != nil {
			log.Printf("helm: skipping release secret %s/%s: %v", s.Namespace, s.Name, derr)
			continue
		}
		if best == nil || rel.Version > best.Version {
			best = rel
		}
	}
	if best == nil {
		writeErr(w, errf(http.StatusNotFound, "NotFound", "release %q not found in %q", name, ns))
		return
	}
	writeJSON(w, http.StatusOK, toDetail(best, ns))
}

// ---- release decode -------------------------------------------------------

// release is the minimal subset of the Helm v3 release JSON we parse.
type release struct {
	Name      string          `json:"name"`
	Namespace string          `json:"namespace"`
	Version   int             `json:"version"`
	Info      releaseInfo     `json:"info"`
	Chart     releaseChart    `json:"chart"`
	Config    json.RawMessage `json:"config"`
	Manifest  string          `json:"manifest"`
}

type releaseInfo struct {
	Status       string `json:"status"`
	Notes        string `json:"notes"`
	LastDeployed string `json:"last_deployed"`
}

type releaseChart struct {
	Metadata chartMetadata `json:"metadata"`
}

type chartMetadata struct {
	Name       string `json:"name"`
	Version    string `json:"version"`
	AppVersion string `json:"appVersion"`
}

// decodeReleaseSecret decodes the Secret.Data["release"] payload. client-go has
// already k8s-base64-decoded the Secret value into raw bytes, so `raw` is
// base64(gzip(JSON)). The chain is: base64-decode → gzip-inflate → JSON. If the
// base64-decoded bytes are themselves gzip (magic 0x1f 0x8b) we inflate; if the
// raw bytes are already gzip (a pre-decoded payload), we fall back to inflating
// those; otherwise it is an error.
func decodeReleaseSecret(raw []byte) (*release, error) {
	if len(raw) == 0 {
		return nil, fmt.Errorf("empty release payload")
	}
	var gz []byte
	if dec, err := base64.StdEncoding.DecodeString(string(raw)); err == nil && hasGzipMagic(dec) {
		gz = dec
	} else if hasGzipMagic(raw) {
		// Already-raw gzip (not base64-wrapped).
		gz = raw
	} else {
		return nil, fmt.Errorf("release payload is not base64(gzip(...))")
	}
	jsonBytes, err := gunzip(gz)
	if err != nil {
		return nil, fmt.Errorf("gunzip release: %w", err)
	}
	var rel release
	if err := json.Unmarshal(jsonBytes, &rel); err != nil {
		return nil, fmt.Errorf("unmarshal release JSON: %w", err)
	}
	return &rel, nil
}

func hasGzipMagic(b []byte) bool {
	return len(b) >= 2 && b[0] == 0x1f && b[1] == 0x8b
}

func gunzip(b []byte) ([]byte, error) {
	zr, err := gzip.NewReader(bytes.NewReader(b))
	if err != nil {
		return nil, err
	}
	defer zr.Close()
	// Bound the inflated size to avoid a decompression bomb from a hostile
	// Secret (releases are small; 64MiB is generous headroom).
	out, err := io.ReadAll(io.LimitReader(zr, 64<<20))
	if err != nil {
		return nil, err
	}
	return out, nil
}

func toRelease(rel *release, ns string) Release {
	return Release{
		Name:         rel.Name,
		Namespace:    ns,
		Revision:     rel.Version,
		Status:       rel.Info.Status,
		Chart:        rel.Chart.Metadata.Name,
		ChartVersion: rel.Chart.Metadata.Version,
		AppVersion:   rel.Chart.Metadata.AppVersion,
		Updated:      normalizeTime(rel.Info.LastDeployed),
	}
}

func toDetail(rel *release, ns string) ReleaseDetail {
	return ReleaseDetail{
		Release:         toRelease(rel, ns),
		Values:          valuesYAML(rel.Config),
		Notes:           rel.Info.Notes,
		ManifestSummary: summarizeManifest(rel.Manifest),
	}
}

// valuesYAML renders the user config (a JSON object) as YAML. An absent or empty
// config renders as "".
func valuesYAML(config json.RawMessage) string {
	trimmed := strings.TrimSpace(string(config))
	if trimmed == "" || trimmed == "null" || trimmed == "{}" {
		return ""
	}
	y, err := yaml.JSONToYAML(config)
	if err != nil {
		return ""
	}
	return string(y)
}

// normalizeTime reparses a Helm timestamp into RFC3339. Helm stores an RFC3339
// time already; if parsing fails we pass the original string through.
func normalizeTime(s string) string {
	if s == "" {
		return ""
	}
	if t, err := time.Parse(time.RFC3339, s); err == nil {
		return t.Format(time.RFC3339)
	}
	if t, err := time.Parse(time.RFC3339Nano, s); err == nil {
		return t.Format(time.RFC3339)
	}
	return s
}

// summarizeManifest parses the rendered multi-doc YAML manifest, counting
// objects by kind, and renders "Deployment x1, Service x2" sorted by kind.
func summarizeManifest(manifest string) string {
	counts := map[string]int{}
	for _, doc := range splitYAMLDocs(manifest) {
		doc = strings.TrimSpace(doc)
		if doc == "" {
			continue
		}
		var meta struct {
			Kind string `json:"kind"`
		}
		if err := yaml.Unmarshal([]byte(doc), &meta); err != nil {
			continue
		}
		if meta.Kind == "" {
			continue
		}
		counts[meta.Kind]++
	}
	if len(counts) == 0 {
		return ""
	}
	kinds := make([]string, 0, len(counts))
	for k := range counts {
		kinds = append(kinds, k)
	}
	sort.Strings(kinds)
	parts := make([]string, 0, len(kinds))
	for _, k := range kinds {
		parts = append(parts, fmt.Sprintf("%s x%d", k, counts[k]))
	}
	return strings.Join(parts, ", ")
}

// splitYAMLDocs splits a multi-document YAML string on `---` separators,
// handling a leading `---` and the `\n---\n` form.
func splitYAMLDocs(s string) []string {
	s = strings.ReplaceAll(s, "\r\n", "\n")
	var docs []string
	var cur strings.Builder
	for _, line := range strings.Split(s, "\n") {
		if strings.TrimRight(line, " \t") == "---" {
			docs = append(docs, cur.String())
			cur.Reset()
			continue
		}
		cur.WriteString(line)
		cur.WriteByte('\n')
	}
	docs = append(docs, cur.String())
	return docs
}

// ---- chart repos (operator config, plain HTTP) ----------------------------

func (h *Handler) listRepos(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, h.repos)
}

func (h *Handler) listCharts(w http.ResponseWriter, r *http.Request) {
	name := r.URL.Query().Get("repo")
	if name == "" {
		writeErr(w, errf(http.StatusBadRequest, "BadRequest", "missing required query param: repo"))
		return
	}
	var repoURL string
	found := false
	for _, repo := range h.repos {
		if repo.Name == name {
			repoURL = repo.URL
			found = true
			break
		}
	}
	if !found {
		writeErr(w, errf(http.StatusNotFound, "NotFound", "unknown repo: %q", name))
		return
	}
	charts, err := h.fetchCharts(r.Context(), repoURL)
	if err != nil {
		writeErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, charts)
}

// repoIndex is the subset of a Helm repository index.yaml we parse.
type repoIndex struct {
	APIVersion string                  `json:"apiVersion"`
	Entries    map[string][]indexChart `json:"entries"`
}

type indexChart struct {
	Name        string `json:"name"`
	Version     string `json:"version"`
	Description string `json:"description"`
}

func (h *Handler) fetchCharts(ctx context.Context, repoURL string) ([]Chart, *apiError) {
	u := strings.TrimRight(repoURL, "/") + "/index.yaml"
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return nil, errf(http.StatusBadGateway, "BadGateway", "chart repo request: %v", err)
	}
	resp, err := h.hc.Do(req)
	if err != nil {
		return nil, errf(http.StatusBadGateway, "BadGateway", "chart repo fetch failed: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, errf(http.StatusBadGateway, "BadGateway", "chart repo index.yaml returned %d", resp.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, 32<<20))
	if err != nil {
		return nil, errf(http.StatusBadGateway, "BadGateway", "chart repo read: %v", err)
	}
	var idx repoIndex
	if err := yaml.Unmarshal(body, &idx); err != nil {
		return nil, errf(http.StatusBadGateway, "BadGateway", "chart repo index.yaml: invalid YAML: %v", err)
	}
	out := make([]Chart, 0, len(idx.Entries))
	for name, versions := range idx.Entries {
		if len(versions) == 0 {
			continue
		}
		// Entries are typically newest-first; take the first.
		v := versions[0]
		cname := v.Name
		if cname == "" {
			cname = name
		}
		out = append(out, Chart{Name: cname, Version: v.Version, Description: v.Description})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })
	return out, nil
}

// ---- validation -----------------------------------------------------------

// validName rejects empty names and anything with a slash or control/space
// character. Helm release and namespace names are DNS-label-ish; we stay lenient
// but block path/selector-breaking characters.
func validName(s string) bool {
	if s == "" || len(s) > 253 {
		return false
	}
	for _, r := range s {
		// Reject path, whitespace, control, and label-selector meta characters
		// (, = ( ) !) so a crafted name can never alter the owner=helm,name=<name>
		// selector; an invalid name is a clean 400 rather than an apiserver error.
		switch {
		case r == '/' || r == ',' || r == ' ' || r == '=' || r == '(' || r == ')' || r == '!':
			return false
		case r < 0x20 || r == 0x7f:
			return false
		}
	}
	return true
}

// ---- error / JSON rendering (contract error body {error,code,reason}) ------
//
// Rendered locally (not via httpapi) to avoid an import cycle, mirroring the
// registry module.

type apiError struct {
	code   int
	reason string
	msg    string
}

func (e *apiError) Error() string { return e.msg }

func errf(code int, reason, format string, a ...any) *apiError {
	return &apiError{code: code, reason: reason, msg: fmt.Sprintf(format, a...)}
}

// mapK8sErr maps a Kubernetes API error (e.g. Forbidden from RBAC) to an
// apiError carrying the upstream status, so an RBAC denial surfaces as 403
// rather than a blanket 500.
func mapK8sErr(err error) *apiError {
	var st apierrors.APIStatus
	if errors.As(err, &st) {
		s := st.Status()
		code := int(s.Code)
		if code == 0 {
			code = http.StatusInternalServerError
		}
		reason := string(s.Reason)
		if reason == "" {
			reason = "InternalError"
		}
		return errf(code, reason, "%s", s.Message)
	}
	return errf(http.StatusInternalServerError, "InternalError", "kubernetes error: %v", err)
}

func writeErr(w http.ResponseWriter, err error) {
	if ae, ok := err.(*apiError); ok {
		writeJSON(w, ae.code, map[string]any{"error": ae.msg, "code": ae.code, "reason": ae.reason})
		return
	}
	writeJSON(w, http.StatusInternalServerError,
		map[string]any{"error": err.Error(), "code": 500, "reason": "InternalError"})
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}
