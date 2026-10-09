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

// ServiceMap is now served by the internal/servicemap package (B10 #54); the B0
// stub that lived here has been removed and wired through Deps.ServiceMap.

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}
