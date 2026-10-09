package auth

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

// TestMiddlewareInjectsOperator: with no identity already on ctx (OIDC
// disabled), Middleware injects the Operator identity with an empty Token (so
// downstream uses the SA clients), and never reads request headers.
func TestMiddlewareInjectsOperator(t *testing.T) {
	var got Identity
	h := Middleware(http.HandlerFunc(func(_ http.ResponseWriter, r *http.Request) {
		got = From(r.Context())
	}))

	req := httptest.NewRequest("GET", "/api/catalog", nil)
	// Attacker-supplied headers must be ignored.
	req.Header.Set("Impersonate-User", "evil")
	req.Header.Set("Impersonate-Group", "system:masters")
	req.Header.Set("Authorization", "Bearer evil-token")
	h.ServeHTTP(httptest.NewRecorder(), req)

	if got.User != Operator {
		t.Errorf("User = %q, want operator %q", got.User, Operator)
	}
	if got.Token != "" {
		t.Errorf("Token should be empty (SA clients), got %q", got.Token)
	}
	if len(got.Groups) != 0 {
		t.Errorf("Groups should be empty, got %v", got.Groups)
	}
}

// TestMiddlewarePreservesExistingIdentity: when an outer (authn) middleware has
// already placed an identity on ctx, Middleware passes it through unchanged.
func TestMiddlewarePreservesExistingIdentity(t *testing.T) {
	var got Identity
	h := Middleware(http.HandlerFunc(func(_ http.ResponseWriter, r *http.Request) {
		got = From(r.Context())
	}))
	want := Identity{User: "alice@example.com", Token: "real-token", Groups: []string{"devs"}}

	req := httptest.NewRequest("GET", "/api/catalog", nil)
	req = req.WithContext(WithIdentity(req.Context(), want))
	h.ServeHTTP(httptest.NewRecorder(), req)

	if got.User != want.User || got.Token != want.Token {
		t.Errorf("identity not preserved: got %+v want %+v", got, want)
	}
}
