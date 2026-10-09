package obs

import "net/http"

// SecurityHeaders sets a baseline set of security-response headers on every
// response, then delegates to next. It is meant to sit as an OUTER middleware
// (just inside recovery) so the headers apply to the SPA and all of /api.
//
// It deliberately sets headers BEFORE calling next and does NOT wrap the
// ResponseWriter: wrapping would hide the http.Flusher/http.Hijacker that the
// SSE, logs, exec and port-forward handlers rely on. Headers written before a
// streaming/upgrade handler takes over are harmless — they are flushed with the
// response head and never interfere with the body or the hijack.
//
// No Content-Security-Policy is set here: a strict CSP risks breaking the built
// SPA, so it is left as a documented follow-up.
func SecurityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("X-Frame-Options", "DENY")
		h.Set("Referrer-Policy", "same-origin")
		h.Set("Cross-Origin-Opener-Policy", "same-origin")
		// HSTS only over HTTPS: advertising it on a plain-http response is
		// meaningless (and would wrongly pin a dev http endpoint).
		if isHTTPS(r) {
			h.Set("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
		}
		next.ServeHTTP(w, r)
	})
}

// isHTTPS reports whether the request arrived over TLS, either directly
// (r.TLS set) or via a terminating proxy that sets X-Forwarded-Proto: https.
func isHTTPS(r *http.Request) bool {
	return r.TLS != nil || r.Header.Get("X-Forwarded-Proto") == "https"
}
