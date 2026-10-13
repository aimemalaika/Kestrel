package observe

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/aimemalaika/Kestrel/internal/auth"
)

const tok = "user-oidc-token"

const vector = `{"status":"success","data":{"resultType":"vector","result":[{"metric":{"__name__":"up"},"value":[1,"1"]}]}}`

func fakeProm(t *testing.T, seen *[]string) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if got := r.Header.Get("Authorization"); got != "Bearer "+tok {
			t.Errorf("Authorization = %q, want Bearer %s", got, tok)
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		if seen != nil {
			*seen = append(*seen, r.URL.RequestURI())
		}
		switch r.URL.Path {
		case "/api/v1/query", "/api/v1/query_range", "/api/v1/alerts", "/api/v1/rules", "/api/v1/targets":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(vector))
		default:
			http.NotFound(w, r)
		}
	}))
}

func do(h http.Handler, path string, withToken bool) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodGet, path, nil)
	if withToken {
		req = req.WithContext(auth.WithIdentity(req.Context(), auth.Identity{User: "u", Token: tok}))
	}
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	return rr
}

func TestUnconfigured503(t *testing.T) {
	rr := do(NewHandler(Config{}), "/api/observe/query?query=up", true)
	if rr.Code != http.StatusServiceUnavailable {
		t.Fatalf("code = %d, want 503", rr.Code)
	}
	var e map[string]any
	if err := json.Unmarshal(rr.Body.Bytes(), &e); err != nil || e["reason"] != "ServiceUnavailable" || e["error"] == nil {
		t.Fatalf("bad error body: %s", rr.Body)
	}
}

func TestNoTokenFailsClosed(t *testing.T) {
	var seen []string
	srv := fakeProm(t, &seen)
	defer srv.Close()
	rr := do(NewHandler(Config{PrometheusURL: srv.URL}), "/api/observe/query?query=up", false)
	if rr.Code != http.StatusServiceUnavailable {
		t.Fatalf("code = %d, want 503", rr.Code)
	}
	if len(seen) != 0 {
		t.Fatalf("upstream was called without a user token: %v", seen)
	}
}

func TestQueryForwardsBearer(t *testing.T) {
	srv := fakeProm(t, nil)
	defer srv.Close()
	rr := do(NewHandler(Config{PrometheusURL: srv.URL + "/"}), "/api/observe/query?query=up", true)
	if rr.Code != http.StatusOK {
		t.Fatalf("code = %d body=%s", rr.Code, rr.Body)
	}
	if rr.Body.String() != vector {
		t.Fatalf("body = %s", rr.Body)
	}
}

func TestOtherEndpoints(t *testing.T) {
	srv := fakeProm(t, nil)
	defer srv.Close()
	h := NewHandler(Config{PrometheusURL: srv.URL})
	for _, p := range []string{"alerts", "rules", "targets", "query_range?query=up&start=1&end=2&step=15"} {
		if rr := do(h, "/api/observe/"+p, true); rr.Code != http.StatusOK {
			t.Errorf("%s: code = %d body=%s", p, rr.Code, rr.Body)
		}
	}
}

func TestBadRequests(t *testing.T) {
	srv := fakeProm(t, nil)
	defer srv.Close()
	h := NewHandler(Config{PrometheusURL: srv.URL})
	for _, p := range []string{"query", "query?query=", "query_range?query=up", "query_range?start=1&end=2&step=1"} {
		if rr := do(h, "/api/observe/"+p, true); rr.Code != http.StatusBadRequest {
			t.Errorf("%s: code = %d, want 400", p, rr.Code)
		}
	}
}

func TestConfigNoToken(t *testing.T) {
	h := NewHandler(Config{PrometheusURL: "http://p", LokiURL: "http://l", GrafanaURL: "https://g.example.com/"})
	rr := do(h, "/api/observe/config", false)
	if rr.Code != http.StatusOK {
		t.Fatalf("code = %d", rr.Code)
	}
	var c map[string]any
	_ = json.Unmarshal(rr.Body.Bytes(), &c)
	if c["prometheus"] != true || c["alertmanager"] != false || c["loki"] != true || c["grafanaUrl"] != "https://g.example.com" {
		t.Fatalf("config = %v", c)
	}
	var off map[string]any
	_ = json.Unmarshal(do(NewHandler(Config{}), "/api/observe/config", false).Body.Bytes(), &off)
	if off["prometheus"] != false {
		t.Fatalf("unconfigured config = %v", off)
	}
}

func TestParamWhitelist(t *testing.T) {
	var seen []string
	srv := fakeProm(t, &seen)
	defer srv.Close()
	h := NewHandler(Config{PrometheusURL: srv.URL})
	rr := do(h, "/api/observe/query?query=up&time=5&evil=1&timeout=99&lookback_delta=1h", true)
	if rr.Code != http.StatusOK {
		t.Fatalf("code = %d", rr.Code)
	}
	if len(seen) != 1 || seen[0] != "/api/v1/query?query=up&time=5" {
		t.Fatalf("upstream saw %v", seen)
	}
}

func TestMethodNotAllowedAndUnknown(t *testing.T) {
	h := NewHandler(Config{})
	req := httptest.NewRequest(http.MethodPost, "/api/observe/query", nil)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusMethodNotAllowed {
		t.Fatalf("code = %d", rr.Code)
	}
	if rr := do(h, "/api/observe/nope", true); rr.Code != http.StatusNotFound {
		t.Fatalf("code = %d", rr.Code)
	}
}
