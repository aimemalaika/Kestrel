package authn

import (
	"encoding/json"
	"net/http"
	"net/url"
	"strings"

	"github.com/aimemalaika/Kestrel/internal/auth"
)

// Middleware is the outer authn layer (installed only when OIDC is enabled). For
// /api/* it: (1) enforces a same-origin Origin/Referer check on state-changing
// requests (CSRF), (2) requires a valid session (401 otherwise), and (3) places
// Identity{User,Groups,Token} on the context, refreshing the id_token if near
// expiry. Non-/api paths (/auth/*, the SPA) pass through, with identity attached
// when a valid session exists.
//
// Identity is resolved from the SESSION ONLY. Inbound Authorization and
// Impersonate-* request headers are never read, so the browser cannot forge an
// identity or inject a token.
func (a *Authenticator) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		apiPath := r.URL.Path == "/api" || strings.HasPrefix(r.URL.Path, "/api/")

		// CSRF / cross-origin defense. Mutating requests require a present,
		// same-origin Origin/Referer. The WS/SSE upgrade GETs (exec, port-forward,
		// stream, logs) are state-bearing despite being GET, so they are Origin-
		// checked too — mirroring the WS CheckOrigin policy (an absent Origin, i.e.
		// a non-browser client, is allowed; a present Origin must be same-origin).
		if apiPath {
			switch {
			case isMutating(r.Method):
				if !sameOrigin(r) {
					// follow-up: once the SPA is wired to echo a token, add a double-submit
					// CSRF token in addition to this Origin check (do not require a custom
					// header before then — it would break the untouched frontend).
					writeAuthError(w, http.StatusForbidden, "Forbidden", "cross-origin request rejected")
					return
				}
			case isUpgradeOrStreamPath(r.URL.Path):
				if !originOK(r) {
					writeAuthError(w, http.StatusForbidden, "Forbidden", "cross-origin request rejected")
					return
				}
			}
		}

		id, ok := a.resolve(r)
		if apiPath && !ok {
			writeAuthError(w, http.StatusUnauthorized, "Unauthorized", "authentication required")
			return
		}
		if ok {
			r = r.WithContext(auth.WithIdentity(r.Context(), id))
		}
		next.ServeHTTP(w, r)
	})
}

// resolve loads and validates the session for r, refreshing the id_token as
// needed, and returns the user's identity. ok is false when there is no valid
// session (missing/tampered cookie, unknown session, or refresh failure).
func (a *Authenticator) resolve(r *http.Request) (auth.Identity, bool) {
	sid, ok := a.sessionIDFromCookie(r)
	if !ok {
		return auth.Identity{}, false
	}
	sess, ok := a.store.get(sid)
	if !ok {
		return auth.Identity{}, false
	}
	token, err := a.currentToken(r.Context(), sess)
	if err != nil {
		// Refresh failed: the session can no longer forward a valid token.
		a.store.delete(sid)
		return auth.Identity{}, false
	}
	sess.mu.Lock()
	id := auth.Identity{
		User:   sess.User,
		Groups: append([]string(nil), sess.Groups...),
		Token:  token,
		Expiry: sess.Expiry,
	}
	sess.mu.Unlock()
	return id, true
}

// isMutating reports whether the method is state-changing (anything but the safe
// GET/HEAD/OPTIONS).
func isMutating(method string) bool {
	switch method {
	case http.MethodGet, http.MethodHead, http.MethodOptions:
		return false
	}
	return true
}

// isUpgradeOrStreamPath reports whether p is one of the WS/SSE upgrade/stream
// endpoints that must be Origin-checked despite being served over GET.
func isUpgradeOrStreamPath(p string) bool {
	for _, pre := range []string{"/api/exec", "/api/port-forward", "/api/stream", "/api/logs"} {
		if p == pre || strings.HasPrefix(p, pre+"/") {
			return true
		}
	}
	return false
}

// sameOrigin reports whether the request's Origin (or Referer) is same scheme+
// host as the request. A state-changing request with neither header is rejected.
func sameOrigin(r *http.Request) bool {
	src := r.Header.Get("Origin")
	if src == "" {
		src = r.Header.Get("Referer")
	}
	if src == "" {
		return false
	}
	return sameOriginURL(src, r)
}

// originOK mirrors the WS CheckOrigin policy for the stream/upgrade GETs: allow
// when there is no Origin header (non-browser client); otherwise require the
// Origin to be same scheme+host as the request.
func originOK(r *http.Request) bool {
	origin := r.Header.Get("Origin")
	if origin == "" {
		return true
	}
	return sameOriginURL(origin, r)
}

// requestScheme is the scheme the request arrived on: https when served over TLS
// or behind a proxy that set X-Forwarded-Proto: https, else http.
func requestScheme(r *http.Request) string {
	if r.TLS != nil || strings.EqualFold(r.Header.Get("X-Forwarded-Proto"), "https") {
		return "https"
	}
	return "http"
}

// sameOriginURL reports whether src (an Origin/Referer URL) has the same host as
// the request and, when it carries a scheme, the same scheme as the request —
// so an http:// origin never passes for an https request.
func sameOriginURL(src string, r *http.Request) bool {
	u, err := url.Parse(src)
	if err != nil || u.Host == "" {
		return false
	}
	if !strings.EqualFold(u.Host, r.Host) {
		return false
	}
	if u.Scheme != "" && !strings.EqualFold(u.Scheme, requestScheme(r)) {
		return false
	}
	return true
}

// writeAuthError writes the contract error body {error,code,reason}. Kept local
// to avoid an import cycle with internal/httpapi.
func writeAuthError(w http.ResponseWriter, code int, reason, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(map[string]any{
		"error":  msg,
		"code":   code,
		"reason": reason,
	})
}
