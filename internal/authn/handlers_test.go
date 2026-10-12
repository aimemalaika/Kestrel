package authn

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestLogin_ForwardsConnectorID(t *testing.T) {
	a := testAuth(&fakeOAuth{}, fakeVerifier{})
	rec := httptest.NewRecorder()
	a.Login(rec, httptest.NewRequest(http.MethodGet, "/auth/login?connector=github", nil))
	loc := rec.Header().Get("Location")
	if !strings.Contains(loc, "connector_id=github") {
		t.Fatalf("expected connector_id=github in redirect, got %q", loc)
	}
}

func TestLogin_NoConnector_NoParam(t *testing.T) {
	a := testAuth(&fakeOAuth{}, fakeVerifier{})
	rec := httptest.NewRecorder()
	a.Login(rec, httptest.NewRequest(http.MethodGet, "/auth/login", nil))
	if strings.Contains(rec.Header().Get("Location"), "connector_id") {
		t.Fatal("no connector param should be sent when ?connector is absent")
	}
}

func TestPasswordLogin_Success(t *testing.T) {
	oauth := &fakeOAuth{pwToken: idToken("raw-id")}
	a := testAuth(oauth, fakeVerifier{fn: func(string) (Claims, error) {
		return Claims{Username: "alice@corp.com", Groups: []string{"devs"}}, nil
	}})
	body := strings.NewReader("username=alice@corp.com&password=s3cret")
	req := httptest.NewRequest(http.MethodPost, "/auth/password", body)
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	rec := httptest.NewRecorder()
	a.PasswordLogin(rec, req)
	if rec.Code != http.StatusNoContent {
		t.Fatalf("code=%d body=%s", rec.Code, rec.Body)
	}
	if oauth.lastUser != "alice@corp.com" || oauth.lastPass != "s3cret" {
		t.Fatalf("creds not relayed: %q/%q", oauth.lastUser, oauth.lastPass)
	}
	if len(rec.Result().Cookies()) == 0 {
		t.Fatal("expected a session cookie to be set")
	}
	if a.store.len() != 1 {
		t.Fatalf("expected one session, got %d", a.store.len())
	}
}

func TestPasswordLogin_GETRejected(t *testing.T) {
	oauth := &fakeOAuth{pwToken: idToken("raw-id")}
	a := testAuth(oauth, fakeVerifier{})
	// Credentials in the query string must never be read (GET is rejected first).
	req := httptest.NewRequest(http.MethodGet, "/auth/password?username=x&password=y", nil)
	rec := httptest.NewRecorder()
	a.PasswordLogin(rec, req)
	if rec.Code != http.StatusMethodNotAllowed {
		t.Fatalf("code=%d want 405", rec.Code)
	}
	if oauth.lastUser != "" || oauth.lastPass != "" {
		t.Fatal("credentials must not be read from the query string")
	}
	if a.store.len() != 0 {
		t.Fatal("no session on a rejected GET")
	}
}

func TestPasswordLogin_BadCreds(t *testing.T) {
	a := testAuth(&fakeOAuth{pwErr: errors.New("invalid_grant")}, fakeVerifier{})
	req := httptest.NewRequest(http.MethodPost, "/auth/password", strings.NewReader("username=x&password=y"))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	rec := httptest.NewRecorder()
	a.PasswordLogin(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("code=%d want 401", rec.Code)
	}
	if a.store.len() != 0 {
		t.Fatal("no session on bad creds")
	}
}
