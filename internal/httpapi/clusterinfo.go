package httpapi

import (
	"log/slog"
	"net/http"

	"github.com/aimemalaika/Kestrel/internal/k8s"
)

// ClusterInfo is the read-only identity of the connected cluster. Every field is
// sourced from the real connection or an explicit flag/env — never hardcoded —
// and any field that cannot be sourced is left empty for the UI to disclose.
type ClusterInfo struct {
	ClusterName   string `json:"clusterName"`   // display name (flag/env), may be ""
	ServerVersion string `json:"serverVersion"` // k8s server version, "" if unknown
	APIServerURL  string `json:"apiServerURL"`  // from rest.Config.Host, "" under --mock
}

// clusterInfo serves GET /api/cluster-info. It never 500s: a discovery failure
// leaves ServerVersion empty (logged, not surfaced), and a nil accessor (--mock)
// yields empty version/URL.
func (a *api) clusterInfo(w http.ResponseWriter, r *http.Request) {
	info := ClusterInfo{ClusterName: a.d.ClusterName}
	if a.d.Accessor != nil {
		if v, err := k8s.ServerVersion(a.d.Accessor); err != nil {
			slog.Warn("cluster-info: server version unavailable", slog.Any("error", err))
		} else {
			info.ServerVersion = v
		}
		if cfg := a.d.Accessor.RESTConfig(); cfg != nil {
			info.APIServerURL = cfg.Host
		}
	}
	writeJSON(w, http.StatusOK, info)
}
