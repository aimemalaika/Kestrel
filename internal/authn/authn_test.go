package authn

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"golang.org/x/oauth2"

	"github.com/aimemalaika/Kestrel/internal/auth"
)

// --- fakes ------------------------------------------------------------------

type fakeOAuth struct {
	token    *oauth2.Token
	exchErr  error
	ts       oauth2.TokenSource
	lastCode string
}

func (f *fakeOAuth) AuthCodeURL(state string, _ ...oauth2.AuthCodeOption) string {
	return "https://idp.example.com/authorize?state=" + state
}
func (f *fakeOAuth) Exchange(_ context.Context, code string, _ ...oauth2.AuthCodeOption) (*oauth2.Token, error) {
	f.lastCode = code
	if f.exchErr != nil {
		return nil, f.exchErr
	}
	return f.token, nil
}
func (f *fakeOAuth) TokenSource(context.Context, *oauth2.Token) oauth2.TokenSource { return f.ts }

type fakeVerifier struct {
	fn func(raw string) (Claims, error)
}

func (f fakeVerifier) Verify(_ context.Context, raw string) (Claims, error) { return f.fn(raw) }

type fakeTS struct {
	tok *oauth2.Token
	err error
}

func (f fakeTS) Token() (*oauth2.Token, error) { return f.tok, f.err }

func idToken(raw string) *oauth2.Token {
	return (&oauth2.Token{AccessToken: "access", RefreshToken: "refresh"}).
		WithExtra(map[string]any{"id_token": raw})
}

func testAuth(oauth OAuth2, v Verifier) *Authenticator {
	return &Authenticator{
		oauth:    oauth,
		verifier: v,
		store:    newSessionStore(),
		key:      []byte("test-hmac-key-0123456789"),
		now:      func() time.Time { return time.Unix(1_700_000_000, 0) },
	}
}

// --- cookie / HMAC ----------------------------------------------------------

func TestSignVerifyRoundTrip(t *testing.T) {
	key := []byte("k")
	v := signValue(key, "session-id-abc")
	got, ok := verifyValue(key, v)
	if !ok || got != "session-id-abc" {
		t.Fatalf("round-trip failed: %q %v", got, ok)
	}
	// Tampered value is rejected.
	if _, ok := verifyValue(key, v+"x"); ok {
		t.Error("tampered signature accepted")
	}
	if _, ok := verifyValue(key, "nodot"); ok {
		t.Error("value with no signature accepted")
	}
	// Wrong key is rejected.
	if _, ok := verifyValue([]byte("other"), v); ok {
		t.Error("signature verified under the wrong key")
	}
}

func TestSessionCookieFlags(t *testing.T) {
	a := testAuth(nil, nil)

	// HTTP: Secure must be off; HttpOnly + SameSite=Lax on.
	rec := httptest.NewRecorder()
	a.setSessionCookie(rec, httptest.NewRequest("GET", "http://host/", nil), "sid", a.now().Add(time.Hour))
	c := rec.Result().Cookies()[0]
	if !c.HttpOnly || c.SameSite != http.SameSiteLaxMode {
		t.Errorf("want HttpOnly + SameSite=Lax, got HttpOnly=%v SameSite=%v", c.HttpOnly, c.SameSite)
	}
	if c.Secure {
		t.Error("Secure must be false over plain HTTP")
	}
	if _, ok := verifyValue(a.key, c.Value); !ok {
		t.Error("cookie value is not a valid signed session id")
	}

	// HTTPS via X-Forwarded-Proto: Secure must be on.
	rec = httptest.NewRecorder()
	r := httptest.NewRequest("GET", "http://host/", nil)
	r.Header.Set("X-Forwarded-Proto", "https")
	a.setSessionCookie(rec, r, "sid", time.Time{})
	if !rec.Result().Cookies()[0].Secure {
		t.Error("Secure must be true behind an https proxy")
	}
}

// --- OIDC callback (faked verifier + exchanger) -----------------------------

func TestCallbackCreatesSession(t *testing.T) {
	a := testAuth(nil, nil)
	state, nonce := a.newState()
	exp := a.now().Add(time.Hour)
	oauth := &fakeOAuth{token: idToken("raw-id-token")}
	a.oauth = oauth
	a.verifier = fakeVerifier{fn: func(raw string) (Claims, error) {
		return Claims{Username: "alice@example.com", Groups: []string{"devs"}, Nonce: nonce, Expiry: exp}, nil
	}}

	rec := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/auth/callback?code=the-code&state="+state, nil)
	req.AddCookie(&http.Cookie{Name: oauthStateCookie, Value: state}) // state<->browser binding
	a.Callback(rec, req)

	res := rec.Result()
	if res.StatusCode != http.StatusFound {
		t.Fatalf("status %d, want 302", res.StatusCode)
	}
	if oauth.lastCode != "the-code" {
		t.Errorf("exchange got code %q", oauth.lastCode)
	}
	var sessionCookie *http.Cookie
	for _, c := range res.Cookies() {
		if c.Name == cookieName {
			sessionCookie = c
		}
	}
	if sessionCookie == nil {
		t.Fatal("no session cookie set")
	}
	sid, ok := verifyValue(a.key, sessionCookie.Value)
	if !ok {
		t.Fatal("session cookie not validly signed")
	}
	sess, ok := a.store.get(sid)
	if !ok {
		t.Fatal("session not stored")
	}
	if sess.User != "alice@example.com" || sess.IDToken != "raw-id-token" {
		t.Errorf("session mis-stored: %+v", sess)
	}
	if sess.RefreshToken != "refresh" {
		t.Errorf("refresh token not stored: %q", sess.RefreshToken)
	}
}

func TestCallbackBadStateNoSession(t *testing.T) {
	a := testAuth(&fakeOAuth{token: idToken("x")}, fakeVerifier{fn: func(string) (Claims, error) {
		return Claims{}, nil
	}})
	for _, url := range []string{
		"/auth/callback?code=c&state=tampered.sig",
		"/auth/callback?code=c", // missing state
	} {
		rec := httptest.NewRecorder()
		a.Callback(rec, httptest.NewRequest("GET", url, nil))
		if rec.Result().StatusCode != http.StatusBadRequest {
			t.Errorf("%s: status %d, want 400", url, rec.Result().StatusCode)
		}
	}
	if n := a.store.len(); n != 0 {
		t.Errorf("no session should exist after bad state, got %d", n)
	}
}

func TestCallbackNonceMismatch(t *testing.T) {
	a := testAuth(nil, nil)
	state, _ := a.newState()
	a.oauth = &fakeOAuth{token: idToken("x")}
	a.verifier = fakeVerifier{fn: func(string) (Claims, error) {
		return Claims{Username: "u", Nonce: "WRONG-NONCE", Expiry: a.now().Add(time.Hour)}, nil
	}}
	rec := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/auth/callback?code=c&state="+state, nil)
	req.AddCookie(&http.Cookie{Name: oauthStateCookie, Value: state})
	a.Callback(rec, req)
	if rec.Result().StatusCode != http.StatusUnauthorized {
		t.Errorf("nonce mismatch should be 401, got %d", rec.Result().StatusCode)
	}
	if a.store.len() != 0 {
		t.Error("session created despite nonce mismatch")
	}
}

// TestCallbackStateCookieMismatch is the login-CSRF / session-fixation guard: a
// callback whose state query param does not match the browser's state cookie is
// rejected (400) BEFORE any code exchange, and no session is created — even
// though the state itself is validly signed and a verifier would accept it.
func TestCallbackStateCookieMismatch(t *testing.T) {
	a := testAuth(nil, nil)
	attackerState, nonce := a.newState() // attacker's validly-signed state
	victimState, _ := a.newState()       // a different state bound to the victim's browser
	oauth := &fakeOAuth{token: idToken("raw-id-token")}
	a.oauth = oauth
	a.verifier = fakeVerifier{fn: func(string) (Claims, error) {
		return Claims{Username: "attacker@example.com", Nonce: nonce, Expiry: a.now().Add(time.Hour)}, nil
	}}

	// Victim's browser carries victimState in its cookie; attacker supplies
	// attackerState+code in the callback URL.
	rec := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/auth/callback?code=the-code&state="+attackerState, nil)
	req.AddCookie(&http.Cookie{Name: oauthStateCookie, Value: victimState})
	a.Callback(rec, req)

	if rec.Result().StatusCode != http.StatusBadRequest {
		t.Fatalf("state/cookie mismatch should be 400, got %d", rec.Result().StatusCode)
	}
	if oauth.lastCode != "" {
		t.Errorf("code exchanged despite state mismatch (lastCode=%q)", oauth.lastCode)
	}
	if a.store.len() != 0 {
		t.Errorf("session created despite state/cookie mismatch, got %d", a.store.len())
	}

	// A callback with NO state cookie at all is likewise rejected.
	rec = httptest.NewRecorder()
	a.Callback(rec, httptest.NewRequest("GET", "/auth/callback?code=the-code&state="+attackerState, nil))
	if rec.Result().StatusCode != http.StatusBadRequest {
		t.Fatalf("absent state cookie should be 400, got %d", rec.Result().StatusCode)
	}
	if a.store.len() != 0 {
		t.Error("session created despite absent state cookie")
	}
}

// TestLoginSetsStateCookie asserts Login binds the state to the browser via a
// hardened, /auth-scoped cookie whose value equals the state in the redirect.
func TestLoginSetsStateCookie(t *testing.T) {
	a := testAuth(&fakeOAuth{}, nil)
	rec := httptest.NewRecorder()
	a.Login(rec, httptest.NewRequest("GET", "https://kestrel.example/auth/login", nil))

	var sc *http.Cookie
	for _, c := range rec.Result().Cookies() {
		if c.Name == oauthStateCookie {
			sc = c
		}
	}
	if sc == nil {
		t.Fatal("Login did not set the oauth state cookie")
	}
	if !sc.HttpOnly || sc.SameSite != http.SameSiteLaxMode || sc.Path != "/auth" {
		t.Errorf("state cookie flags: HttpOnly=%v SameSite=%v Path=%q", sc.HttpOnly, sc.SameSite, sc.Path)
	}
	if !sc.Secure {
		t.Error("state cookie must be Secure over HTTPS")
	}
	// The redirect's state query param must equal the cookie value (the binding).
	loc := rec.Result().Header.Get("Location")
	if !strings.Contains(loc, "state="+sc.Value) {
		t.Errorf("redirect state does not match cookie: loc=%q cookie=%q", loc, sc.Value)
	}
}

func TestCallbackVerifyFailure(t *testing.T) {
	a := testAuth(nil, nil)
	state, _ := a.newState()
	a.oauth = &fakeOAuth{token: idToken("x")}
	a.verifier = fakeVerifier{fn: func(string) (Claims, error) {
		return Claims{}, errors.New("signature invalid")
	}}
	rec := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/auth/callback?code=c&state="+state, nil)
	req.AddCookie(&http.Cookie{Name: oauthStateCookie, Value: state})
	a.Callback(rec, req)
	if rec.Result().StatusCode != http.StatusUnauthorized {
		t.Errorf("verify failure should be 401, got %d", rec.Result().StatusCode)
	}
}

func TestLogoutClearsSession(t *testing.T) {
	a := testAuth(nil, nil)
	sid := randID()
	a.store.put(sid, &session{User: "u", IDToken: "t"})
	cookie := &http.Cookie{Name: cookieName, Value: signValue(a.key, sid)}

	rec := httptest.NewRecorder()
	r := httptest.NewRequest("GET", "/auth/logout", nil)
	r.AddCookie(cookie)
	a.Logout(rec, r)

	if _, ok := a.store.get(sid); ok {
		t.Error("session not deleted on logout")
	}
	cleared := rec.Result().Cookies()[0]
	if cleared.MaxAge >= 0 {
		t.Errorf("logout cookie should be expired (MaxAge<0), got %d", cleared.MaxAge)
	}
}

// --- token refresh ----------------------------------------------------------

func TestCurrentTokenRefreshes(t *testing.T) {
	a := testAuth(nil, nil)
	newExp := a.now().Add(time.Hour)
	a.oauth = &fakeOAuth{ts: fakeTS{tok: idToken("raw-id-2")}}
	a.verifier = fakeVerifier{fn: func(raw string) (Claims, error) {
		if raw != "raw-id-2" {
			t.Errorf("verifier called with %q, want the refreshed token", raw)
		}
		return Claims{Username: "u", Expiry: newExp}, nil
	}}

	// Session whose id_token is already expired → must refresh.
	sess := &session{
		User:    "u",
		IDToken: "raw-id-1",
		Expiry:  a.now().Add(-time.Minute),
		token:   idToken("raw-id-1"),
	}
	tok, err := a.currentToken(context.Background(), sess)
	if err != nil {
		t.Fatalf("currentToken: %v", err)
	}
	if tok != "raw-id-2" {
		t.Errorf("forwarded token = %q, want refreshed raw-id-2", tok)
	}
	if sess.IDToken != "raw-id-2" || !sess.Expiry.Equal(newExp) {
		t.Errorf("session not updated after refresh: %+v", sess)
	}
}

func TestCurrentTokenNoRefreshWhenFresh(t *testing.T) {
	a := testAuth(&fakeOAuth{ts: fakeTS{err: errors.New("should not be called")}}, nil)
	sess := &session{User: "u", IDToken: "fresh", Expiry: a.now().Add(time.Hour), token: idToken("fresh")}
	tok, err := a.currentToken(context.Background(), sess)
	if err != nil || tok != "fresh" {
		t.Fatalf("fresh token should pass through unchanged: %q %v", tok, err)
	}
}

func TestCurrentTokenRefreshFailure(t *testing.T) {
	a := testAuth(&fakeOAuth{ts: fakeTS{err: errors.New("refresh denied")}}, nil)
	sess := &session{User: "u", IDToken: "old", Expiry: a.now().Add(-time.Minute), token: idToken("old")}
	if _, err := a.currentToken(context.Background(), sess); err == nil {
		t.Error("refresh failure should surface an error")
	}
}

// --- middleware: auth + identity + CSRF -------------------------------------

func newSessionCookie(a *Authenticator, user, token string) *http.Cookie {
	sid := randID()
	a.store.put(sid, &session{User: user, Groups: []string{"g1"}, IDToken: token, Expiry: a.now().Add(time.Hour)})
	return &http.Cookie{Name: cookieName, Value: signValue(a.key, sid)}
}

func TestMiddlewareUnauthenticatedAPI401(t *testing.T) {
	a := testAuth(nil, nil)
	h := a.Middleware(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		t.Error("handler reached despite no session")
		w.WriteHeader(200)
	}))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest("GET", "/api/catalog", nil))
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status %d, want 401", rec.Code)
	}
}

func TestMiddlewareValidSessionSetsIdentity(t *testing.T) {
	a := testAuth(nil, nil)
	cookie := newSessionCookie(a, "bob@example.com", "bobs-id-token")

	var got auth.Identity
	h := a.Middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		got = auth.From(r.Context())
		w.WriteHeader(200)
	}))

	r := httptest.NewRequest("GET", "/api/catalog", nil)
	r.AddCookie(cookie)
	// Attacker headers must NOT influence the resolved identity or token.
	r.Header.Set("Impersonate-User", "evil")
	r.Header.Set("Authorization", "Bearer evil-token")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, r)

	if rec.Code != 200 {
		t.Fatalf("status %d, want 200", rec.Code)
	}
	if got.User != "bob@example.com" {
		t.Errorf("User = %q, want from session", got.User)
	}
	if got.Token != "bobs-id-token" {
		t.Errorf("Token = %q, want session id_token (not the header)", got.Token)
	}
}

func TestMiddlewareCSRFOrigin(t *testing.T) {
	a := testAuth(nil, nil)
	reached := func() (http.Handler, *bool) {
		hit := false
		return a.Middleware(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			hit = true
			w.WriteHeader(200)
		})), &hit
	}

	// Cross-origin mutating requests ⇒ 403 (before auth).
	for _, m := range []string{"POST", "PUT", "DELETE"} {
		h, hit := reached()
		r := httptest.NewRequest(m, "http://kestrel.example/api/apply", nil)
		r.Header.Set("Origin", "http://evil.example")
		r.AddCookie(newSessionCookie(a, "u", "t"))
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, r)
		if rec.Code != http.StatusForbidden {
			t.Errorf("%s cross-origin: status %d, want 403", m, rec.Code)
		}
		if *hit {
			t.Errorf("%s cross-origin: handler reached", m)
		}
	}

	// Same-origin mutating request with a valid session ⇒ allowed.
	h, hit := reached()
	r := httptest.NewRequest("PUT", "http://kestrel.example/api/apply", nil)
	r.Header.Set("Origin", "http://kestrel.example")
	r.AddCookie(newSessionCookie(a, "u", "t"))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, r)
	if rec.Code != 200 || !*hit {
		t.Errorf("same-origin PUT: status %d hit=%v, want 200 reached", rec.Code, *hit)
	}

	// GET is unaffected by the CSRF check (cross-origin GET with a session is OK).
	h, hit = reached()
	r = httptest.NewRequest("GET", "http://kestrel.example/api/catalog", nil)
	r.Header.Set("Origin", "http://evil.example")
	r.AddCookie(newSessionCookie(a, "u", "t"))
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, r)
	if rec.Code != 200 || !*hit {
		t.Errorf("cross-origin GET: status %d hit=%v, want 200 reached", rec.Code, *hit)
	}
}

// TestMiddlewareStreamOriginCheck covers FIX 3: the WS/SSE upgrade GETs are
// Origin-checked. A cross-origin Origin is rejected (403); same-origin and an
// absent Origin (non-browser client) are allowed.
func TestMiddlewareStreamOriginCheck(t *testing.T) {
	a := testAuth(nil, nil)
	reached := func() (http.Handler, *bool) {
		hit := false
		return a.Middleware(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			hit = true
			w.WriteHeader(200)
		})), &hit
	}

	for _, p := range []string{"/api/exec/v1/pods/default/web", "/api/port-forward/v1/pods/default/web",
		"/api/stream", "/api/logs/v1/pods/default/web"} {
		// Cross-origin Origin ⇒ 403 (before auth).
		h, hit := reached()
		r := httptest.NewRequest("GET", "http://kestrel.example"+p, nil)
		r.Header.Set("Origin", "http://evil.example")
		r.AddCookie(newSessionCookie(a, "u", "t"))
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, r)
		if rec.Code != http.StatusForbidden || *hit {
			t.Errorf("%s cross-origin: code=%d hit=%v, want 403 not-reached", p, rec.Code, *hit)
		}

		// Same-origin Origin ⇒ allowed.
		h, hit = reached()
		r = httptest.NewRequest("GET", "http://kestrel.example"+p, nil)
		r.Header.Set("Origin", "http://kestrel.example")
		r.AddCookie(newSessionCookie(a, "u", "t"))
		rec = httptest.NewRecorder()
		h.ServeHTTP(rec, r)
		if rec.Code != 200 || !*hit {
			t.Errorf("%s same-origin: code=%d hit=%v, want 200 reached", p, rec.Code, *hit)
		}

		// Absent Origin (non-browser client) ⇒ allowed.
		h, hit = reached()
		r = httptest.NewRequest("GET", "http://kestrel.example"+p, nil)
		r.AddCookie(newSessionCookie(a, "u", "t"))
		rec = httptest.NewRecorder()
		h.ServeHTTP(rec, r)
		if rec.Code != 200 || !*hit {
			t.Errorf("%s no-origin: code=%d hit=%v, want 200 reached", p, rec.Code, *hit)
		}
	}

	// Scheme mismatch (FIX 6): an http origin for an https request is rejected.
	h, hit := reached()
	r := httptest.NewRequest("GET", "https://kestrel.example/api/stream", nil)
	r.Header.Set("Origin", "http://kestrel.example")
	r.AddCookie(newSessionCookie(a, "u", "t"))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, r)
	if rec.Code != http.StatusForbidden || *hit {
		t.Errorf("scheme mismatch: code=%d hit=%v, want 403 not-reached", rec.Code, *hit)
	}
}

// TestSessionStoreEvictsExpired covers FIX 5: the janitor removes abandoned
// (long-expired, unrefreshed) sessions while leaving live and zero-expiry ones.
func TestSessionStoreEvictsExpired(t *testing.T) {
	s := newSessionStore()
	defer s.stop()
	now := time.Unix(1_700_000_000, 0)
	s.put("live", &session{Expiry: now.Add(time.Hour)})
	s.put("dead", &session{Expiry: now.Add(-2 * expiredSessionGrace)})
	s.put("nozero", &session{}) // zero expiry is never reaped

	s.evictExpired(now)

	if _, ok := s.get("dead"); ok {
		t.Error("expired-beyond-grace session not reaped")
	}
	if _, ok := s.get("live"); !ok {
		t.Error("live session wrongly reaped")
	}
	if _, ok := s.get("nozero"); !ok {
		t.Error("zero-expiry session wrongly reaped")
	}
}

func TestMiddlewareNonAPIPassThrough(t *testing.T) {
	a := testAuth(nil, nil)
	hit := false
	h := a.Middleware(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		hit = true
		w.WriteHeader(200)
	}))
	// No session, but a non-/api path must not 401 (SPA + /auth live here).
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest("GET", "/index.html", nil))
	if !hit || rec.Code != 200 {
		t.Errorf("non-api path should pass through: hit=%v code=%d", hit, rec.Code)
	}
}
