package obs

import "strings"

// Path groups. These are a FIXED, low-cardinality set used as the `path_group`
// metric label and request-log field. The raw request path is NEVER used as a
// label (a resource path like /api/core/v1/namespaces/foo/pods/bar would blow up
// Prometheus cardinality); every request maps to one of these constants.
const (
	groupAPIResource    = "api_resource"
	groupAPIStream      = "api_stream"
	groupAPILogs        = "api_logs"
	groupAPIExec        = "api_exec"
	groupAPIPortForward = "api_portforward"
	groupCatalog        = "catalog"
	groupApply          = "apply"
	groupCanI           = "can-i"
	groupRegistry       = "registry"
	groupHelm           = "helm"
	groupAuth           = "auth"
	groupSPA            = "spa"
	groupOther          = "other"
)

// classify maps a request path to its low-cardinality path group. The matching
// mirrors the router in internal/httpapi/router.go so the groups line up with
// the real endpoints.
func classify(path string) string {
	switch {
	case path == "/auth" || strings.HasPrefix(path, "/auth/"):
		return groupAuth
	case path == "/api" || strings.HasPrefix(path, "/api/"):
		return classifyAPI(strings.Trim(strings.TrimPrefix(path, "/api"), "/"))
	case path == "/" || !strings.HasPrefix(path, "/api"):
		// Everything else is the embedded SPA (static assets + client routes).
		return groupSPA
	default:
		return groupOther
	}
}

// classifyAPI maps the path remainder after /api to a group. rest is the
// slash-trimmed tail, e.g. "catalog" or "core/v1/pods".
func classifyAPI(rest string) string {
	if rest == "" {
		return groupOther
	}
	first := rest
	if i := strings.IndexByte(rest, '/'); i >= 0 {
		first = rest[:i]
	}
	switch first {
	case "stream":
		return groupAPIStream
	case "logs":
		return groupAPILogs
	case "exec":
		return groupAPIExec
	case "port-forward":
		return groupAPIPortForward
	case "catalog":
		return groupCatalog
	case "apply":
		return groupApply
	case "can-i":
		return groupCanI
	case "registry":
		return groupRegistry
	case "helm":
		return groupHelm
	default:
		// {group}/{version}/... resource reads — one bucket, never the raw path.
		return groupAPIResource
	}
}

// isStreamGroup reports whether a group is a long-lived streaming/upgrade
// endpoint. These are excluded from the latency histogram (a never-ending SSE
// would skew it) and counted in the active-streams gauge instead.
func isStreamGroup(group string) bool {
	switch group {
	case groupAPIStream, groupAPILogs, groupAPIExec, groupAPIPortForward:
		return true
	}
	return false
}
