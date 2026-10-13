package authn

import (
	"encoding/json"
	"net/http"
)

// AuthInfo is the unauthenticated discovery payload the SPA uses to render the
// login UI. It carries NO secrets — only the active mode, the current user when
// a valid session is present (best-effort), and the available login options.
type AuthInfo struct {
	Mode    string       `json:"mode"` // "single-operator" | "oidc"
	User    *AuthUser    `json:"user,omitempty"`
	Options []AuthOption `json:"options"`
	// AdminGroups is the configured --admin-groups list. The backend does not
	// compute admin-ness; the SPA intersects it with the user's own groups.
	AdminGroups []string `json:"adminGroups,omitempty"`
}

type AuthUser struct {
	Name   string   `json:"name"`
	Groups []string `json:"groups,omitempty"`
}

// AuthOption is one login choice the user can pick. Start is the URL to navigate
// to in order to begin that flow (e.g. "/auth/login"). Plan 2 differentiates
// github/password; this plan emits at most one generic "oidc" option.
type AuthOption struct {
	ID    string `json:"id"`
	Label string `json:"label"`
	Start string `json:"start,omitempty"`
}

// AuthInfoHandler serves the static `info` (mode + options), and, when authr is
// non-nil and the request carries a valid session, fills User from it. authr may
// be nil (single-operator). Resolution failures are swallowed — never 500.
func AuthInfoHandler(info AuthInfo, authr *Authenticator) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		out := info
		if out.User == nil && authr != nil {
			if id, ok := authr.resolve(r); ok {
				out.User = &AuthUser{Name: id.User, Groups: id.Groups}
			}
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(out)
	}
}
