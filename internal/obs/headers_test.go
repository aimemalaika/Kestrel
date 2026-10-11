package obs

import (
	"crypto/tls"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestSecurityHeaders(t *testing.T) {
	const csp = "default-src 'self'"
	h := SecurityHeaders(csp, false, http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	// Plain HTTP: baseline headers present, CSP set, HSTS absent.
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/", nil))
	want := map[string]string{
		"X-Content-Type-Options":     "nosniff",
		"X-Frame-Options":            "DENY",
		"Referrer-Policy":            "same-origin",
		"Cross-Origin-Opener-Policy": "same-origin",
		"Content-Security-Policy":    csp,
	}
	for k, v := range want {
		if got := rec.Header().Get(k); got != v {
			t.Errorf("header %s = %q, want %q", k, got, v)
		}
	}
	if hsts := rec.Header().Get("Strict-Transport-Security"); hsts != "" {
		t.Errorf("HSTS set on plain-http response: %q", hsts)
	}

	// Direct TLS: HSTS present.
	rec = httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "https://example/", nil)
	req.TLS = &tls.ConnectionState{}
	h.ServeHTTP(rec, req)
	if hsts := rec.Header().Get("Strict-Transport-Security"); hsts != "max-age=31536000; includeSubDomains" {
		t.Errorf("HSTS over TLS = %q, want the 1-year includeSubDomains value", hsts)
	}
}

// TestSecurityHeadersCSPConfigurable covers the configurable CSP: a non-empty
// policy is sent verbatim; an empty policy drops the header entirely.
func TestSecurityHeadersCSPConfigurable(t *testing.T) {
	// Empty CSP ⇒ header absent, baseline headers unchanged.
	rec := httptest.NewRecorder()
	SecurityHeaders("", false, http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {})).
		ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/", nil))
	if got := rec.Header().Get("Content-Security-Policy"); got != "" {
		t.Errorf("CSP header set for empty policy: %q", got)
	}
	if got := rec.Header().Get("X-Content-Type-Options"); got != "nosniff" {
		t.Errorf("baseline header changed with empty CSP: nosniff=%q", got)
	}

	// Custom CSP ⇒ sent verbatim.
	rec = httptest.NewRecorder()
	const custom = "default-src 'none'; img-src 'self'"
	SecurityHeaders(custom, false, http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {})).
		ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/", nil))
	if got := rec.Header().Get("Content-Security-Policy"); got != custom {
		t.Errorf("CSP = %q, want %q", got, custom)
	}
}

// TestSecurityHeadersHSTSTrustProxy covers XFP gating of HSTS: X-Forwarded-Proto
// is only honored when trustProxy is true; r.TLS always yields HSTS.
func TestSecurityHeadersHSTSTrustProxy(t *testing.T) {
	hsts := func(trustProxy bool, setXFP bool) string {
		rec := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		if setXFP {
			req.Header.Set("X-Forwarded-Proto", "https")
		}
		SecurityHeaders("", trustProxy, http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {})).
			ServeHTTP(rec, req)
		return rec.Header().Get("Strict-Transport-Security")
	}

	if h := hsts(false, true); h != "" {
		t.Errorf("XFP=https, trustProxy=false: HSTS=%q, want absent (header ignored)", h)
	}
	if h := hsts(true, true); h == "" {
		t.Error("XFP=https, trustProxy=true: HSTS absent, want present")
	}
	if h := hsts(true, false); h != "" {
		t.Errorf("plain http, trustProxy=true: HSTS=%q, want absent", h)
	}
}

// TestSecurityHeadersPreservesFlusher confirms the middleware does NOT wrap the
// ResponseWriter: the http.Flusher an SSE handler relies on must still be
// reachable downstream (wrapping it would break streaming/WS).
func TestSecurityHeadersPreservesFlusher(t *testing.T) {
	var sawFlusher bool
	h := SecurityHeaders(DefaultCSP, false, http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, sawFlusher = w.(http.Flusher)
	}))
	// httptest.ResponseRecorder implements http.Flusher.
	h.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/api/stream/core/v1/pods", nil))
	if !sawFlusher {
		t.Fatal("ResponseWriter is no longer an http.Flusher: SecurityHeaders must not wrap the writer")
	}
}
