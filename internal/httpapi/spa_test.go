package httpapi_test

import (
	"net/http/httptest"
	"strings"
	"testing"
	"testing/fstest"

	"github.com/aimemalaika/Kestrel/internal/httpapi"
)

func TestSPAFallbackWhenNotBuilt(t *testing.T) {
	rec := httptest.NewRecorder()
	httpapi.SPA(fstest.MapFS{".gitkeep": {}}).ServeHTTP(rec, httptest.NewRequest("GET", "/some/route", nil))
	if rec.Code != 200 || !strings.Contains(rec.Body.String(), "Kestrel") {
		t.Errorf("fallback failed: %d %s", rec.Code, rec.Body.String())
	}
}

func TestSPAServesIndexForUnknownPath(t *testing.T) {
	fs := fstest.MapFS{"index.html": {Data: []byte("INDEX")}, "a.js": {Data: []byte("JS")}}
	rec := httptest.NewRecorder()
	httpapi.SPA(fs).ServeHTTP(rec, httptest.NewRequest("GET", "/nodes/x", nil))
	if rec.Body.String() != "INDEX" {
		t.Errorf("got %q", rec.Body.String())
	}
	rec = httptest.NewRecorder()
	httpapi.SPA(fs).ServeHTTP(rec, httptest.NewRequest("GET", "/a.js", nil))
	if rec.Body.String() != "JS" {
		t.Errorf("got %q", rec.Body.String())
	}
}
