// Package httpapi is the HTTP layer: routing, handlers, error mapping, SSE.
package httpapi

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/aimemalaika/Kestrel/internal/auth"
	"github.com/aimemalaika/Kestrel/internal/k8s"
	"github.com/aimemalaika/Kestrel/internal/modules"
	"github.com/aimemalaika/Kestrel/internal/resource"
	"github.com/aimemalaika/Kestrel/internal/stream"
)

// Deps are the collaborators the API needs.
type Deps struct {
	Resources *resource.Service
	Stream    stream.Source
}

// DefaultDeps wires the B0 stubs.
func DefaultDeps() Deps {
	return Deps{Resources: resource.NewService(k8s.Stub{}), Stream: stream.StubSource{}}
}

// New returns the API handler. It expects full request paths (/api/...).
// Routing is hand-rolled because resource paths (/api/{group}/{version}/...)
// would otherwise conflict with the fixed prefixes under ServeMux.
func New(d Deps) http.Handler {
	a := &api{d: d}
	return auth.Middleware(http.HandlerFunc(a.route))
}

type api struct{ d Deps }

func (a *api) route(w http.ResponseWriter, r *http.Request) {
	rest := strings.Trim(strings.TrimPrefix(r.URL.Path, "/api"), "/")
	if !strings.HasPrefix(r.URL.Path, "/api") || rest == "" {
		writeStatus(w, 404, "NotFound", "unknown API path")
		return
	}
	segs := strings.Split(rest, "/")
	switch segs[0] {
	case "catalog":
		a.only(w, r, http.MethodGet, a.catalog)
	case "apply":
		a.only(w, r, http.MethodPut, a.apply)
	case "can-i":
		a.only(w, r, http.MethodPost, a.canI)
	case "stream":
		a.only(w, r, http.MethodGet, func(w http.ResponseWriter, r *http.Request) { a.stream(w, r, segs[1:]) })
	case "logs":
		a.only(w, r, http.MethodGet, a.logs)
	case "exec", "port-forward":
		a.only(w, r, http.MethodGet, notImplementedWS)
	case "registry", "helm", "argo":
		a.only(w, r, http.MethodGet, modules.Handler(segs[0]).ServeHTTP)
	case "servicemap":
		modules.ServiceMap().ServeHTTP(w, r)
	default:
		a.resource(w, r, segs)
	}
}

func (a *api) only(w http.ResponseWriter, r *http.Request, method string, h http.HandlerFunc) {
	if r.Method != method {
		w.Header().Set("Allow", method)
		writeStatus(w, http.StatusMethodNotAllowed, "MethodNotAllowed", r.Method+" not allowed on "+r.URL.Path)
		return
	}
	h(w, r)
}

// parseRef parses {group}/{version}/[namespaces/{ns}/]{resource}[/{name}].
// Segment counts: 3 cluster list, 4 cluster get, 5 ns list, 6 ns get. A
// 4-segment path whose third part is "namespaces" is a cluster-scoped get of
// the Namespace resource itself (core/v1/namespaces/foo).
func parseRef(segs []string) (k8s.Ref, bool) {
	switch {
	case len(segs) == 3:
		return resource.Ref(segs[0], segs[1], "", segs[2], ""), true
	case len(segs) == 4:
		return resource.Ref(segs[0], segs[1], "", segs[2], segs[3]), true
	case len(segs) == 5 && segs[2] == "namespaces":
		return resource.Ref(segs[0], segs[1], segs[3], segs[4], ""), true
	case len(segs) == 6 && segs[2] == "namespaces":
		return resource.Ref(segs[0], segs[1], segs[3], segs[4], segs[5]), true
	}
	return k8s.Ref{}, false
}

func (a *api) catalog(w http.ResponseWriter, r *http.Request) {
	entries, err := a.d.Resources.Catalog(r.Context())
	if err != nil {
		WriteError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, entries)
}

func (a *api) resource(w http.ResponseWriter, r *http.Request, segs []string) {
	ref, ok := parseRef(segs)
	if !ok {
		writeStatus(w, 404, "NotFound", "unknown API path "+r.URL.Path)
		return
	}
	dry := r.URL.Query().Get("dryRun") == "true"
	switch r.Method {
	case http.MethodGet:
		if ref.Name == "" {
			items, err := a.d.Resources.List(r.Context(), ref)
			if err != nil {
				WriteError(w, err)
				return
			}
			writeJSON(w, http.StatusOK, items)
			return
		}
		obj, err := a.d.Resources.Get(r.Context(), ref)
		if err != nil {
			WriteError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, obj)
	case http.MethodDelete:
		if ref.Name == "" {
			writeStatus(w, http.StatusMethodNotAllowed, "MethodNotAllowed", "delete requires a resource name")
			return
		}
		if err := a.d.Resources.Delete(r.Context(), ref, dry); err != nil {
			WriteError(w, err)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	default:
		w.Header().Set("Allow", "GET, DELETE")
		writeStatus(w, http.StatusMethodNotAllowed, "MethodNotAllowed", r.Method+" not allowed on "+r.URL.Path)
	}
}

func (a *api) apply(w http.ResponseWriter, r *http.Request) {
	var obj k8s.Object
	if err := json.NewDecoder(r.Body).Decode(&obj); err != nil {
		writeStatus(w, http.StatusBadRequest, "BadRequest", "invalid JSON body: "+err.Error())
		return
	}
	out, err := a.d.Resources.Apply(r.Context(), obj, r.URL.Query().Get("dryRun") == "true")
	if err != nil {
		WriteError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, out)
}

func (a *api) canI(w http.ResponseWriter, r *http.Request) {
	var req k8s.CanIRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeStatus(w, http.StatusBadRequest, "BadRequest", "invalid JSON body: "+err.Error())
		return
	}
	allowed, err := a.d.Resources.CanI(r.Context(), req)
	if err != nil {
		WriteError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, k8s.CanIResponse{Allowed: allowed})
}

func (a *api) stream(w http.ResponseWriter, r *http.Request, segs []string) {
	ref, ok := parseRef(segs)
	if !ok {
		writeStatus(w, 404, "NotFound", "unknown stream path "+r.URL.Path)
		return
	}
	ch, err := a.d.Stream.Watch(r.Context(), ref)
	if err != nil {
		WriteError(w, err)
		return
	}
	sw := stream.Begin(w)
	if sw == nil {
		writeStatus(w, 500, "InternalError", "streaming unsupported")
		return
	}
	for {
		select {
		case <-r.Context().Done():
			return
		case env, open := <-ch:
			if !open {
				return
			}
			if sw.Data(env) != nil {
				return
			}
		}
	}
}

func (a *api) logs(w http.ResponseWriter, r *http.Request) {
	segs := strings.Split(strings.Trim(strings.TrimPrefix(r.URL.Path, "/api/logs"), "/"), "/")
	if _, ok := parseRef(segs); !ok {
		writeStatus(w, 404, "NotFound", "unknown logs path "+r.URL.Path)
		return
	}
	sw := stream.Begin(w)
	if sw == nil {
		writeStatus(w, 500, "InternalError", "streaming unsupported")
		return
	}
	for i := 1; i <= 3; i++ {
		if sw.Raw(fmt.Sprintf("stub log line %d", i)) != nil {
			return
		}
	}
}

// notImplementedWS: exec and port-forward are WebSocket endpoints. B0 avoids a
// websocket dependency; the routes are registered and answer 501 with the
// contract error body. Real upgrade handling lands with B-series exec work.
func notImplementedWS(w http.ResponseWriter, r *http.Request) {
	writeStatus(w, http.StatusNotImplemented, "NotImplemented", "websocket endpoint not implemented in B0")
}
