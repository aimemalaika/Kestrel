package httpapi_test

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/aimemalaika/Kestrel/internal/httpapi"
	"github.com/aimemalaika/Kestrel/internal/k8s"
)

// TestRequestBodyTooLarge asserts the write endpoints cap the request body at
// 4 MiB and answer 413 with the contract reason, while a normal small body is
// still accepted.
func TestRequestBodyTooLarge(t *testing.T) {
	h := handler()
	// A >4 MiB body (valid JSON is unnecessary: the cap trips during Decode).
	big := `{"apiVersion":"v1","kind":"ConfigMap","metadata":{"name":"` +
		strings.Repeat("a", 5<<20) + `"}}`

	for _, tc := range []struct{ method, url string }{
		{"PUT", "/api/apply"},
		{"POST", "/api/can-i"},
	} {
		rec := do(t, h, tc.method, tc.url, big)
		if rec.Code != http.StatusRequestEntityTooLarge {
			t.Fatalf("%s %s: status %d, want 413", tc.method, tc.url, rec.Code)
		}
		body := decode[map[string]any](t, rec)
		if body["reason"] != "RequestEntityTooLarge" {
			t.Errorf("%s %s: reason = %v, want RequestEntityTooLarge", tc.method, tc.url, body["reason"])
		}
	}

	// A normal small body still works on apply.
	small := `{"apiVersion":"v1","kind":"ConfigMap","metadata":{"name":"c","namespace":"default"}}`
	if rec := do(t, h, "PUT", "/api/apply", small); rec.Code != http.StatusOK {
		t.Fatalf("small apply body: status %d, want 200", rec.Code)
	}
}

// TestWriteErrorGenericFor500 asserts a non-StatusError (e.g. a transport error
// naming an internal apiserver address) yields a GENERIC 500 body with no raw
// message, while a StatusError keeps its real message/code.
func TestWriteErrorGenericFor500(t *testing.T) {
	leaky := errors.New("dial tcp 10.11.12.13:443: connect: connection refused")
	rec := httptest.NewRecorder()
	httpapi.WriteError(rec, leaky)
	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("status %d, want 500", rec.Code)
	}
	if strings.Contains(rec.Body.String(), "10.11.12.13") || strings.Contains(rec.Body.String(), "dial tcp") {
		t.Fatalf("500 body leaked the internal error: %s", rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), `"reason":"InternalError"`) ||
		!strings.Contains(rec.Body.String(), `"error":"internal error"`) {
		t.Fatalf("500 body not the generic contract body: %s", rec.Body.String())
	}

	// A StatusError (NotFound) still returns its real message and code.
	rec = httptest.NewRecorder()
	httpapi.WriteError(rec, k8s.NotFound("pods %q not found", "web"))
	if rec.Code != http.StatusNotFound {
		t.Fatalf("StatusError status %d, want 404", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), `web`) || !strings.Contains(rec.Body.String(), `"reason":"NotFound"`) {
		t.Fatalf("StatusError body lost its message/reason: %s", rec.Body.String())
	}
}
