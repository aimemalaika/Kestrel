// Package modules holds the non-generic module endpoints (registry, helm,
// argo, servicemap). B0 handlers are stubs returning JSON placeholders.
package modules

import (
	"encoding/json"
	"net/http"
	"strings"
)

// Handler returns the stub handler for a module prefix ("registry", "helm", "argo").
func Handler(name string) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]any{
			"module": name,
			"path":   strings.TrimPrefix(r.URL.Path, "/api/"+name),
			"items":  []any{},
		})
	})
}

// ServiceMap serves GET (fetch stored map) and PUT (upload + validate).
// Stub: PUT echoes acceptance; GET returns an empty map.
func ServiceMap() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			writeJSON(w, http.StatusOK, map[string]any{"services": []any{}})
		case http.MethodPut:
			writeJSON(w, http.StatusOK, map[string]any{"valid": true, "errors": []string{}})
		default:
			w.Header().Set("Allow", "GET, PUT")
			writeJSON(w, http.StatusMethodNotAllowed, map[string]any{
				"error": "method not allowed", "code": 405, "reason": "MethodNotAllowed"})
		}
	})
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}
