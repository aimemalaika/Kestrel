package obs

import (
	"net/http"
	"strings"
)

// DefaultCSP is the Content-Security-Policy crafted against the built SPA
// (web/dist). It is the --csp flag default; an operator may override it or pass
// --csp="" to drop the header entirely.
//
// Why each non-'self' source is present (everything else is locked to 'self'):
//   - script-src 'self'            — Vite emits only external module scripts
//     (index.html has NO inline/bootstrap <script>), so no hash/'unsafe-inline'
//     is needed here. Kept tight.
//   - style-src 'self' 'unsafe-inline' — the CodeMirror-based YAML editor injects
//     a <style> element at runtime, and React sets inline style="" attributes;
//     both are inline styles a nonce/hash cannot cover without touching web/.
//   - img-src 'self' data:         — CodeMirror renders control glyphs as
//     url('data:image/svg+xml,...') CSS backgrounds (governed by img-src).
//   - connect-src 'self' ws: wss:  — the SPA talks to same-origin /api/* over
//     fetch + EventSource (SSE) and opens WebSockets (exec, port-forward); the
//     ws:/wss: schemes are needed for the WS endpoints.
//   - frame-ancestors 'none'       — clickjacking defense (the modern equivalent
//     of X-Frame-Options: DENY, which is also still sent; both kept, harmless).
//   - base-uri 'self', form-action 'self', object-src 'none' — standard
//     hardening; the SPA uses none of these cross-origin.
//
// No web fonts are loaded (system font stacks only; no @font-face, no data:
// fonts in the build), so font-src is left at the default-src 'self' baseline.
const DefaultCSP = "default-src 'self'; " +
	"script-src 'self'; " +
	"style-src 'self' 'unsafe-inline'; " +
	"img-src 'self' data:; " +
	"font-src 'self'; " +
	"connect-src 'self' ws: wss:; " +
	"frame-ancestors 'none'; " +
	"base-uri 'self'; " +
	"form-action 'self'; " +
	"object-src 'none'"

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
// When csp != "", it is sent as Content-Security-Policy (see DefaultCSP); an
// empty csp drops the header so an operator can disable a too-strict policy.
// trustProxy gates whether X-Forwarded-Proto is honored when deciding HTTPS for
// HSTS — consistent with the rate-limiter's --trusted-proxy gating of XFF.
func SecurityHeaders(csp string, trustProxy bool, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("X-Frame-Options", "DENY")
		h.Set("Referrer-Policy", "same-origin")
		h.Set("Cross-Origin-Opener-Policy", "same-origin")
		if csp != "" {
			h.Set("Content-Security-Policy", csp)
		}
		// HSTS only over HTTPS: advertising it on a plain-http response is
		// meaningless (and would wrongly pin a dev http endpoint).
		if isHTTPS(r, trustProxy) {
			h.Set("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
		}
		next.ServeHTTP(w, r)
	})
}

// isHTTPS reports whether the request arrived over TLS, either directly
// (r.TLS set) or, when trustProxy is true, via a terminating proxy that sets
// X-Forwarded-Proto: https. With trustProxy false the (spoofable) header is
// ignored and only r.TLS is trusted — fail-safe, since treating a request as
// plain http only suppresses HSTS.
func isHTTPS(r *http.Request, trustProxy bool) bool {
	if r.TLS != nil {
		return true
	}
	return trustProxy && strings.EqualFold(r.Header.Get("X-Forwarded-Proto"), "https")
}
