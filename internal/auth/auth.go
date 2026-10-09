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

// FromRequest extracts the caller identity (stub: Impersonate-User/-Group).
func FromRequest(r *http.Request) Identity {
	return Identity{
		User:   r.Header.Get("Impersonate-User"),
		Groups: r.Header.Values("Impersonate-Group"),
	}
}

// Middleware stores the identity on the request context.
func Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ctx := context.WithValue(r.Context(), ctxKey{}, FromRequest(r))
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// From returns the identity stored by Middleware.
func From(ctx context.Context) Identity {
	id, _ := ctx.Value(ctxKey{}).(Identity)
	return id
}
