package obs

import (
	"crypto/tls"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestSecurityHeaders(t *testing.T) {
	h := SecurityHeaders(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	// Plain HTTP: baseline headers present, HSTS absent.
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/", nil))
	want := map[string]string{
		"X-Content-Type-Options":     "nosniff",
		"X-Frame-Options":            "DENY",
		"Referrer-Policy":            "same-origin",
		"Cross-Origin-Opener-Policy": "same-origin",
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

	// Proxied HTTPS via X-Forwarded-Proto: HSTS present.
	rec = httptest.NewRecorder()
	req = httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("X-Forwarded-Proto", "https")
	h.ServeHTTP(rec, req)
	if rec.Header().Get("Strict-Transport-Security") == "" {
		t.Error("HSTS absent for X-Forwarded-Proto: https")
	}
}

// TestSecurityHeadersPreservesFlusher confirms the middleware does NOT wrap the
// ResponseWriter: the http.Flusher an SSE handler relies on must still be
// reachable downstream (wrapping it would break streaming/WS).
func TestSecurityHeadersPreservesFlusher(t *testing.T) {
	var sawFlusher bool
	h := SecurityHeaders(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, sawFlusher = w.(http.Flusher)
	}))
	// httptest.ResponseRecorder implements http.Flusher.
	h.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/api/stream/core/v1/pods", nil))
	if !sawFlusher {
		t.Fatal("ResponseWriter is no longer an http.Flusher: SecurityHeaders must not wrap the writer")
	}
}
