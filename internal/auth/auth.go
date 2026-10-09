// Package auth is the tiny identity-on-context seam. It carries the
// authenticated caller (user, groups, and — as of B7 — the user's own bearer
// token) through the request context. Identity is resolved ONLY from the
// server-side session (see internal/authn); inbound Impersonate-* and
// Authorization headers from the browser are never trusted for identity.
package auth

import (
	"context"
	"net/http"
	"time"
)

// Identity is the authenticated caller. Token is the user's OIDC id_token,
// forwarded verbatim to the kube-apiserver so the user is a real cluster
// identity (RBAC enforced upstream). An empty Token means single-operator /
// OIDC-off: downstream code falls back to Kestrel's own (ServiceAccount)
// credentials.
type Identity struct {
	User   string
	Groups []string
	Token  string
	Expiry time.Time
}

type ctxKey struct{}

// Operator is the default single-operator identity: the user/service account
// Kestrel's own credentials represent when OIDC is disabled.
const Operator = "kestrel-operator"

// WithIdentity returns a context carrying id (used by the authn middleware and
// tests).
func WithIdentity(ctx context.Context, id Identity) context.Context {
	return context.WithValue(ctx, ctxKey{}, id)
}

// Middleware is the OIDC-disabled default: it injects the single Operator
// identity (empty Token ⇒ SA clients) when no identity has already been placed
// on the context by an outer authn middleware. It never reads request headers,
// so Impersonate-*/Authorization from the browser can never forge identity.
func Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if From(r.Context()).User == "" {
			r = r.WithContext(WithIdentity(r.Context(), Identity{User: Operator}))
		}
		next.ServeHTTP(w, r)
	})
}

// From returns the identity stored on the context (zero value when none).
func From(ctx context.Context) Identity {
	id, _ := ctx.Value(ctxKey{}).(Identity)
	return id
}
