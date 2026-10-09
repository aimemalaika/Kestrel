package authn

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"strings"
	"sync"
	"time"

	"golang.org/x/oauth2"
)

const (
	// cookieName is the signed session cookie.
	cookieName = "kestrel_session"
	// oauthStateCookie binds the login redirect's state to THIS browser (CSRF /
	// session-fixation defense): Callback requires the state query param to match
	// this cookie before exchanging the code.
	oauthStateCookie = "kestrel_oauthstate"
	// stateTTL bounds how long a login redirect's signed state is valid.
	stateTTL = 10 * time.Minute
	// refreshSkew refreshes the id_token this long before it expires.
	refreshSkew = 30 * time.Second
	// sessionJanitorInterval is how often the store reaps abandoned sessions.
	sessionJanitorInterval = 5 * time.Minute
	// expiredSessionGrace is how long past id_token expiry an UNrefreshed session
	// lingers before the janitor reaps it. Active sessions are unaffected:
	// currentToken bumps Expiry on every refresh, keeping it in the future.
	expiredSessionGrace = 1 * time.Hour
)

// session is one logged-in user's server-side state. Its own mutex guards the
// mutable token fields so concurrent requests can refresh race-free.
type session struct {
	mu           sync.Mutex
	User         string
	Groups       []string
	IDToken      string
	RefreshToken string
	Expiry       time.Time
	token        *oauth2.Token // full token, for refresh via TokenSource
}

// sessionStore is an in-memory, concurrency-safe session map keyed by a random
// session id. Sessions are lost on restart (see --session-key).
type sessionStore struct {
	mu       sync.Mutex
	m        map[string]*session
	stopCh   chan struct{}
	stopOnce sync.Once
}

// newSessionStore builds an empty store and starts its background janitor, which
// periodically reaps abandoned (long-expired, unrefreshed) sessions so they do
// not linger holding id/refresh tokens. Call stop() to end the janitor.
func newSessionStore() *sessionStore {
	s := &sessionStore{m: map[string]*session{}, stopCh: make(chan struct{})}
	go s.janitor(sessionJanitorInterval)
	return s
}

// janitor reaps expired sessions every interval until stop() is called.
func (s *sessionStore) janitor(interval time.Duration) {
	t := time.NewTicker(interval)
	defer t.Stop()
	for {
		select {
		case <-s.stopCh:
			return
		case now := <-t.C:
			s.evictExpired(now)
		}
	}
}

// stop ends the janitor goroutine. Safe to call more than once.
func (s *sessionStore) stop() {
	s.stopOnce.Do(func() { close(s.stopCh) })
}

// evictExpired deletes every session reapable as of now.
func (s *sessionStore) evictExpired(now time.Time) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for sid, sess := range s.m {
		if reapable(sess, now) {
			delete(s.m, sid)
		}
	}
}

// reapable reports whether sess is an abandoned session: its id_token expired
// more than expiredSessionGrace ago (and was never refreshed forward). A
// zero-expiry session is never reaped. Reads Expiry under the session mutex
// (currentToken writes it under the same lock).
func reapable(sess *session, now time.Time) bool {
	sess.mu.Lock()
	defer sess.mu.Unlock()
	if sess.Expiry.IsZero() {
		return false
	}
	return now.After(sess.Expiry.Add(expiredSessionGrace))
}

func (s *sessionStore) put(sid string, sess *session) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.m[sid] = sess
}

func (s *sessionStore) get(sid string) (*session, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	sess, ok := s.m[sid]
	return sess, ok
}

func (s *sessionStore) delete(sid string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.m, sid)
}

func (s *sessionStore) len() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return len(s.m)
}

// randID returns a 256-bit random, URL-safe identifier.
func randID() string {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		panic(err) // crypto/rand failure is unrecoverable
	}
	return base64.RawURLEncoding.EncodeToString(b)
}

// mac computes the HMAC-SHA256 of msg under key.
func mac(key []byte, msg string) string {
	m := hmac.New(sha256.New, key)
	m.Write([]byte(msg))
	return base64.RawURLEncoding.EncodeToString(m.Sum(nil))
}

// signValue returns "<msg>.<hmac>".
func signValue(key []byte, msg string) string {
	return msg + "." + mac(key, msg)
}

// verifyValue checks the HMAC and returns the original msg. Comparison is
// constant-time.
func verifyValue(key []byte, value string) (string, bool) {
	i := strings.LastIndexByte(value, '.')
	if i < 0 {
		return "", false
	}
	msg, sig := value[:i], value[i+1:]
	if !hmac.Equal([]byte(sig), []byte(mac(key, msg))) {
		return "", false
	}
	return msg, true
}

// --- oauth state (signed, carries the nonce + issued-at for a TTL) ----------

type stateData struct {
	Nonce    string `json:"n"`
	IssuedAt int64  `json:"t"`
}

// newState mints a signed state value and the nonce it carries (also sent to
// the IdP as the id_token nonce).
func (a *Authenticator) newState() (state, nonce string) {
	nonce = randID()
	raw, _ := json.Marshal(stateData{Nonce: nonce, IssuedAt: a.now().Unix()})
	payload := base64.RawURLEncoding.EncodeToString(raw)
	return signValue(a.key, payload), nonce
}

// verifyState validates the signature and TTL and returns the embedded nonce.
func (a *Authenticator) verifyState(state string) (nonce string, ok bool) {
	payload, ok := verifyValue(a.key, state)
	if !ok {
		return "", false
	}
	raw, err := base64.RawURLEncoding.DecodeString(payload)
	if err != nil {
		return "", false
	}
	var sd stateData
	if err := json.Unmarshal(raw, &sd); err != nil || sd.Nonce == "" {
		return "", false
	}
	if a.now().Unix()-sd.IssuedAt > int64(stateTTL.Seconds()) {
		return "", false
	}
	return sd.Nonce, true
}

// --- session cookie ---------------------------------------------------------

// isHTTPS reports whether the request arrived over TLS (directly, or via a
// proxy that set X-Forwarded-Proto: https). It gates the Secure cookie flag.
func isHTTPS(r *http.Request) bool {
	if r.TLS != nil {
		return true
	}
	return strings.EqualFold(r.Header.Get("X-Forwarded-Proto"), "https")
}

// setSessionCookie writes the signed session cookie. HttpOnly + SameSite=Lax
// (CSRF defense) + Secure when the request is HTTPS. The cookie expires with the
// id_token.
func (a *Authenticator) setSessionCookie(w http.ResponseWriter, r *http.Request, sid string, expiry time.Time) {
	c := &http.Cookie{
		Name:     cookieName,
		Value:    signValue(a.key, sid),
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   isHTTPS(r),
	}
	if !expiry.IsZero() {
		c.Expires = expiry
	}
	http.SetCookie(w, c)
}

// clearSessionCookie expires the session cookie.
func (a *Authenticator) clearSessionCookie(w http.ResponseWriter, r *http.Request) {
	http.SetCookie(w, &http.Cookie{
		Name:     cookieName,
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   isHTTPS(r),
		MaxAge:   -1,
	})
}

// sessionIDFromCookie extracts and verifies the session id from the request.
func (a *Authenticator) sessionIDFromCookie(r *http.Request) (string, bool) {
	c, err := r.Cookie(cookieName)
	if err != nil {
		return "", false
	}
	return verifyValue(a.key, c.Value)
}

// --- oauth state cookie (state <-> browser binding) -------------------------

// setStateCookie binds the login state to this browser. HttpOnly + SameSite=Lax
// + Secure under HTTPS, scoped to /auth, and short-lived (stateTTL).
func (a *Authenticator) setStateCookie(w http.ResponseWriter, r *http.Request, state string) {
	http.SetCookie(w, &http.Cookie{
		Name:     oauthStateCookie,
		Value:    state,
		Path:     "/auth",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   isHTTPS(r),
		MaxAge:   int(stateTTL / time.Second),
	})
}

// clearStateCookie expires the oauth state cookie (one-time use).
func (a *Authenticator) clearStateCookie(w http.ResponseWriter, r *http.Request) {
	http.SetCookie(w, &http.Cookie{
		Name:     oauthStateCookie,
		Value:    "",
		Path:     "/auth",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   isHTTPS(r),
		MaxAge:   -1,
	})
}

// stateCookie returns the oauth state value bound to this browser.
func (a *Authenticator) stateCookie(r *http.Request) string {
	c, err := r.Cookie(oauthStateCookie)
	if err != nil {
		return ""
	}
	return c.Value
}

// stateMatches constant-time compares the callback's state query param against
// the browser-bound state cookie. Empty values never match.
func stateMatches(param, cookie string) bool {
	if param == "" || cookie == "" {
		return false
	}
	return hmac.Equal([]byte(param), []byte(cookie))
}
