package authn

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestAuthInfoHandler_SingleOperator(t *testing.T) {
	info := AuthInfo{Mode: "single-operator", User: &AuthUser{Name: "kestrel-operator"}}
	rec := httptest.NewRecorder()
	AuthInfoHandler(info, nil).ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/authinfo", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("code = %d", rec.Code)
	}
	var got AuthInfo
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	if got.Mode != "single-operator" || got.User == nil || got.User.Name != "kestrel-operator" {
		t.Fatalf("got %+v", got)
	}
	if len(got.Options) != 0 {
		t.Fatalf("single-operator should advertise no login options, got %v", got.Options)
	}
}

func TestAuthInfoHandler_OIDC_Unauthenticated(t *testing.T) {
	a := testAuth(&fakeOAuth{}, fakeVerifier{}) // no session cookie on the request
	info := AuthInfo{Mode: "oidc", Options: []AuthOption{{ID: "oidc", Label: "Log in", Start: "/auth/login"}}}
	rec := httptest.NewRecorder()
	AuthInfoHandler(info, a).ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/authinfo", nil))
	var got AuthInfo
	_ = json.Unmarshal(rec.Body.Bytes(), &got)
	if got.Mode != "oidc" || got.User != nil || len(got.Options) != 1 {
		t.Fatalf("got %+v", got)
	}
}

func TestAuthInfoHandler_OIDC_Authenticated(t *testing.T) {
	a := testAuth(&fakeOAuth{}, fakeVerifier{})
	// Reuse the existing session helper (handlers.go store.put + signed cookie).
	req := httptest.NewRequest(http.MethodGet, "/authinfo", nil)
	req.AddCookie(newSessionCookie(a, "alice@corp.com", "tok"))

	rec := httptest.NewRecorder()
	AuthInfoHandler(AuthInfo{Mode: "oidc"}, a).ServeHTTP(rec, req)

	var got AuthInfo
	_ = json.Unmarshal(rec.Body.Bytes(), &got)
	if got.User == nil || got.User.Name != "alice@corp.com" || len(got.User.Groups) != 1 {
		t.Fatalf("expected authenticated user, got %+v", got)
	}
}
