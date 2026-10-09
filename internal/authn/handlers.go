package authn

import (
	"context"
	"net/http"

	"github.com/coreos/go-oidc/v3/oidc"
)

// Login starts the authorization-code flow: it mints a signed state (carrying a
// nonce) and redirects to the OIDC provider.
func (a *Authenticator) Login(w http.ResponseWriter, r *http.Request) {
	state, nonce := a.newState()
	// Bind the state to THIS browser so Callback can reject a state+code minted by
	// an attacker and fed to a victim's /auth/callback (login CSRF / fixation).
	a.setStateCookie(w, r, state)
	http.Redirect(w, r, a.oauth.AuthCodeURL(state, oidc.Nonce(nonce)), http.StatusFound)
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
	tok, err := a.oauth.Exchange(r.Context(), code)
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

	if !claims.Expiry.IsZero() {
		tok.Expiry = claims.Expiry // refresh the token source against id_token expiry
	}
	sid := randID()
	a.store.put(sid, &session{
		User:         claims.Username,
		Groups:       claims.Groups,
		IDToken:      raw,
		RefreshToken: tok.RefreshToken,
		Expiry:       claims.Expiry,
		token:        tok,
	})
	a.setSessionCookie(w, r, sid, claims.Expiry)
	http.Redirect(w, r, "/", http.StatusFound)
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
	nt, err := a.oauth.TokenSource(ctx, sess.token).Token()
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
