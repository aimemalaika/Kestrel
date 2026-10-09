// Package auth is the identity-from-request seam. B0 only reads the
// Impersonate-* headers; real SA/OIDC resolution arrives later without
// changing the contract.
package auth

import (
	"context"
	"net/http"
)

type Identity struct {
	User   string
	Groups []string
}

type ctxKey struct{}

// Operator is the default single-operator identity: the user/service account
// Kestrel's own credentials represent when no Impersonate-* header is sent.
const Operator = "kestrel-operator"

// FromRequest extracts the caller identity from Impersonate-User/-Group,
// defaulting to the single operator.
func FromRequest(r *http.Request) Identity {
	id := Identity{
		User:   r.Header.Get("Impersonate-User"),
		Groups: r.Header.Values("Impersonate-Group"),
	}
	if id.User == "" {
		id.User = Operator
	}
	return id
}

// WithIdentity returns a context carrying id (used by Middleware and tests).
func WithIdentity(ctx context.Context, id Identity) context.Context {
	return context.WithValue(ctx, ctxKey{}, id)
}

// Middleware stores the identity on the request context.
func Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ctx := WithIdentity(r.Context(), FromRequest(r))
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// From returns the identity stored by Middleware.
func From(ctx context.Context) Identity {
	id, _ := ctx.Value(ctxKey{}).(Identity)
	return id
}
