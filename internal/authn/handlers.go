package authn

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strings"

	"github.com/coreos/go-oidc/v3/oidc"
	"golang.org/x/oauth2"
)

// clientCtx injects the CA-trusting HTTP client (when configured) so oauth2
// token-endpoint calls trust the issuer cert, matching discovery/JWKS.
func (a *Authenticator) clientCtx(ctx context.Context) context.Context {
	if a.httpClient == nil {
		return ctx
	}
	return oidc.ClientContext(ctx, a.httpClient)
}

// Login starts the authorization-code flow: it mints a signed state (carrying a
// nonce) and redirects to the OIDC provider. An optional ?connector= pre-selects
// a Dex/Keycloak connector (the backend itself puts this in the advertised
// option's Start URL), so one endpoint serves every connector. The connector id
// is non-sensitive config, never a secret.
func (a *Authenticator) Login(w http.ResponseWriter, r *http.Request) {
	state, nonce := a.newState()
	// Bind the state to THIS browser so Callback can reject a state+code minted by
	// an attacker and fed to a victim's /auth/callback (login CSRF / fixation).
	a.setStateCookie(w, r, state)
	opts := []oauth2.AuthCodeOption{oidc.Nonce(nonce)}
	if c := r.URL.Query().Get("connector"); c != "" {
		opts = append(opts, oauth2.SetAuthURLParam("connector_id", c))
	}
	http.Redirect(w, r, a.oauth.AuthCodeURL(state, opts...), http.StatusFound)
}

// Callback completes the flow: verify state, exchange the code, verify the
// id_token (and its nonce), create a session, set the cookie, and redirect to /.
func (a *Authenticator) Callback(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	if e := q.Get("error"); e != "" {
		writeAuthError(w, http.StatusBadRequest, "BadRequest", "oidc provider error: "+e)
		return
	}
	// State <-> browser binding: the state query param MUST match the browser's
	// state cookie set at Login, BEFORE exchanging the code. This defeats a state
	// (and matching code) minted for the attacker's identity and replayed into a
	// victim's callback. The cookie is one-time use; clear it either way.
	stateParam := q.Get("state")
	cookieState := a.stateCookie(r)
	a.clearStateCookie(w, r)
	if !stateMatches(stateParam, cookieState) {
		writeAuthError(w, http.StatusBadRequest, "BadRequest", "missing or mismatched oauth state")
		return
	}
	nonce, ok := a.verifyState(stateParam)
	if !ok {
		writeAuthError(w, http.StatusBadRequest, "BadRequest", "invalid or expired state")
		return
	}
	code := q.Get("code")
	if code == "" {
		writeAuthError(w, http.StatusBadRequest, "BadRequest", "missing authorization code")
		return
	}
	tok, err := a.oauth.Exchange(a.clientCtx(r.Context()), code)
	if err != nil {
		writeAuthError(w, http.StatusBadGateway, "BadGateway", "token exchange failed: "+err.Error())
		return
	}
	raw, ok := tok.Extra("id_token").(string)
	if !ok || raw == "" {
		writeAuthError(w, http.StatusBadGateway, "BadGateway", "no id_token in token response")
		return
	}
	claims, err := a.verifier.Verify(r.Context(), raw)
	if err != nil {
		writeAuthError(w, http.StatusUnauthorized, "Unauthorized", "id_token verification failed: "+err.Error())
		return
	}
	if claims.Nonce != nonce {
		writeAuthError(w, http.StatusUnauthorized, "Unauthorized", "id_token nonce mismatch")
		return
	}

	a.createSession(w, r, claims, raw, tok)
	http.Redirect(w, r, "/", http.StatusFound)
}

// createSession stores a verified login as a server-side session and sets the
// signed session cookie. Shared by Callback (authorization-code flow) and
// PasswordLogin (ROPC), so both paths establish an identical session.
func (a *Authenticator) createSession(w http.ResponseWriter, r *http.Request, claims Claims, rawIDToken string, tok *oauth2.Token) {
	if !claims.Expiry.IsZero() {
		tok.Expiry = claims.Expiry // refresh the token source against id_token expiry
	}
	sid := randID()
	a.store.put(sid, &session{
		User:         claims.Username,
		Groups:       claims.Groups,
		IDToken:      rawIDToken,
		RefreshToken: tok.RefreshToken,
		Expiry:       claims.Expiry,
		token:        tok,
	})
	a.setSessionCookie(w, r, sid, claims.Expiry)
}

// PasswordLogin authenticates a username+password against the broker via the
// OAuth2 Resource-Owner-Password (ROPC) grant and, on success, establishes the
// same server-side session as the authorization-code callback. POST only, so
// credentials can never arrive in a query string; they come from the request
// body (form or JSON) and are NEVER logged or placed in a URL. Responds 204 on
// success (the SPA re-fetches /authinfo), or the {error,code,reason} contract
// body on failure. Fails closed. CSRF: it enforces POST and relies on
// SameSite=Lax + same-origin fetch; a double-submit token is the proper
// follow-up (see the TODO at middleware.go).
func (a *Authenticator) PasswordLogin(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", http.MethodPost)
		writeAuthError(w, http.StatusMethodNotAllowed, "MethodNotAllowed", "use POST")
		return
	}
	user, pass := credsFromRequest(r)
	if user == "" || pass == "" {
		writeAuthError(w, http.StatusBadRequest, "BadRequest", "username and password are required")
		return
	}
	tok, err := a.oauth.PasswordCredentialsToken(a.clientCtx(r.Context()), user, pass)
	if err != nil {
		// Generic message: never echo the broker error (and never log the creds).
		writeAuthError(w, http.StatusUnauthorized, "Unauthorized", "invalid credentials")
		return
	}
	raw, ok := tok.Extra("id_token").(string)
	if !ok || raw == "" {
		writeAuthError(w, http.StatusBadGateway, "BadGateway", "no id_token in token response")
		return
	}
	claims, err := a.verifier.Verify(r.Context(), raw)
	if err != nil {
		writeAuthError(w, http.StatusUnauthorized, "Unauthorized", "id_token verification failed")
		return
	}
	a.createSession(w, r, claims, raw, tok)
	w.WriteHeader(http.StatusNoContent)
}

// credsFromRequest reads username/password from the POST body only — either
// application/json or form-encoded. Never the query string.
func credsFromRequest(r *http.Request) (user, pass string) {
	if strings.HasPrefix(r.Header.Get("Content-Type"), "application/json") {
		var body struct {
			Username string `json:"username"`
			Password string `json:"password"`
		}
		if json.NewDecoder(io.LimitReader(r.Body, 1<<16)).Decode(&body) == nil {
			return body.Username, body.Password
		}
		return "", ""
	}
	if err := r.ParseForm(); err != nil {
		return "", ""
	}
	return r.PostFormValue("username"), r.PostFormValue("password")
}

// Logout clears the session (server-side) and the cookie.
func (a *Authenticator) Logout(w http.ResponseWriter, r *http.Request) {
	if sid, ok := a.sessionIDFromCookie(r); ok {
		a.store.delete(sid)
	}
	a.clearSessionCookie(w, r)
	http.Redirect(w, r, "/", http.StatusFound)
}

// currentToken returns the id_token to forward for sess, refreshing it first
// when it is near expiry. On refresh failure it returns an error so the caller
// treats the session as no longer valid.
func (a *Authenticator) currentToken(ctx context.Context, sess *session) (string, error) {
	sess.mu.Lock()
	defer sess.mu.Unlock()

	if !a.needsRefresh(sess) {
		return sess.IDToken, nil
	}
	// NOTE: when sess.token == nil we return the stored IDToken unrefreshed. This
	// branch is not reachable in production (Callback always stores a non-nil
	// token), and even if it were, it cannot forward a privilege-escalating token:
	// an expired/stale id_token is rejected (401) by the apiserver. Left as-is.
	if sess.token == nil {
		return sess.IDToken, nil
	}
	nt, err := a.oauth.TokenSource(a.clientCtx(ctx), sess.token).Token()
	if err != nil {
		return "", err
	}
	// A refreshed response carries a new id_token; re-verify and store it.
	if raw, ok := nt.Extra("id_token").(string); ok && raw != "" && raw != sess.IDToken {
		claims, err := a.verifier.Verify(ctx, raw)
		if err != nil {
			return "", err
		}
		sess.IDToken = raw
		sess.Expiry = claims.Expiry
		if !claims.Expiry.IsZero() {
			nt.Expiry = claims.Expiry
		}
	}
	if nt.RefreshToken != "" {
		sess.RefreshToken = nt.RefreshToken
	}
	sess.token = nt
	return sess.IDToken, nil
}

// needsRefresh reports whether the id_token is within refreshSkew of expiry.
func (a *Authenticator) needsRefresh(sess *session) bool {
	if sess.Expiry.IsZero() {
		return false
	}
	return !a.now().Before(sess.Expiry.Add(-refreshSkew))
}

// notConfigured is the /auth/* handler when OIDC is disabled.
func notConfigured(w http.ResponseWriter, _ *http.Request) {
	writeAuthError(w, http.StatusNotFound, "NotFound", "OIDC not configured (set --oidc-issuer to enable login)")
}

// NotConfiguredHandler returns the /auth/* handler for the OIDC-disabled mode.
func NotConfiguredHandler() http.HandlerFunc { return notConfigured }
