package httpapi

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestKubeconfigRoute_DispatchesToDep(t *testing.T) {
	var called bool
	h := New(Deps{Kubeconfig: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called = true
		w.WriteHeader(http.StatusTeapot)
	})})
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/kubeconfig", nil))
	if !called || rec.Code != http.StatusTeapot {
		t.Fatalf("expected dispatch to the Kubeconfig dep, called=%v code=%d", called, rec.Code)
	}
}

func TestKubeconfigRoute_503WhenUnset(t *testing.T) {
	h := New(Deps{}) // no Kubeconfig dep → single-operator 503 stub
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/kubeconfig", nil))
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("code=%d want 503", rec.Code)
	}
}
