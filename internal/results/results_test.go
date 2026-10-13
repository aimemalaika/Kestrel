package results

import (
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/aimemalaika/Kestrel/internal/auth"
)

const tok = "user-oidc-token"

func rec(name, typ, obj string) map[string]any {
	return map[string]any{
		"name": name,
		"uid":  "rec-" + name,
		"data": map[string]any{"type": typ, "value": base64.StdEncoding.EncodeToString([]byte(obj))},
	}
}

const (
	prObj = `{"metadata":{"uid":"u1","name":"build-1","namespace":"dev"},"status":{"startTime":"2026-01-01T00:00:00Z","completionTime":"2026-01-01T00:05:00Z","conditions":[{"type":"Succeeded","status":"True"}]}}`
	trObj = `{"metadata":{"uid":"u2","name":"unit-1","namespace":"dev"},"status":{"startTime":"2026-01-01T00:00:00Z","conditions":[{"type":"Succeeded","status":"False","reason":"Failed"}]}}`
)

const (
	recName = "dev/results/r1/records/rec1"
	logName = "dev/results/r1/logs/log1"
)

func fakeGateway(t *testing.T) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if got := r.Header.Get("Authorization"); got != "Bearer "+tok {
			t.Errorf("Authorization = %q, want Bearer %s", got, tok)
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		switch {
		case strings.HasSuffix(r.URL.Path, "/records"):
			_ = json.NewEncoder(w).Encode(map[string]any{"records": []any{
				rec("dev/results/r1/records/a", "tekton.dev/v1.PipelineRun", prObj),
				rec("dev/results/r2/records/b", "tekton.dev/v1.TaskRun", trObj),
				rec("dev/results/r2/records/c", "results.tekton.dev/v1alpha3.Log", `{}`),
			}})
		case r.URL.Path == apiPrefix+"/parents/"+recName:
			_ = json.NewEncoder(w).Encode(rec(recName, "tekton.dev/v1.PipelineRun", prObj))
		case r.URL.Path == apiPrefix+"/parents/"+logName:
			_, _ = w.Write([]byte("line one\nline two\n"))
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
	h := NewHandler(Config{})
	rr := do(h, "/api/results/runs", true)
	if rr.Code != http.StatusServiceUnavailable {
		t.Fatalf("code = %d, want 503", rr.Code)
	}
	var e map[string]any
	_ = json.Unmarshal(rr.Body.Bytes(), &e)
	if e["reason"] != "ServiceUnavailable" {
		t.Errorf("error body = %v", e)
	}
}

func TestRunsShaped(t *testing.T) {
	gw := fakeGateway(t)
	defer gw.Close()
	rr := do(NewHandler(Config{URL: gw.URL}), "/api/results/runs?namespace=dev", true)
	if rr.Code != 200 {
		t.Fatalf("code = %d body=%s", rr.Code, rr.Body)
	}
	var out struct{ Runs []RunSummary }
	if err := json.Unmarshal(rr.Body.Bytes(), &out); err != nil {
		t.Fatal(err)
	}
	if len(out.Runs) != 2 {
		t.Fatalf("runs = %d, want 2: %s", len(out.Runs), rr.Body)
	}
	a, b := out.Runs[0], out.Runs[1]
	if a.Kind != "PipelineRun" || a.Status != "Succeeded" || a.Name != "build-1" || a.Namespace != "dev" ||
		a.UID != "u1" || a.RecordName != "dev/results/r1/records/a" || a.CompletionTime == "" {
		t.Errorf("pipelinerun summary = %+v", a)
	}
	if b.Kind != "TaskRun" || b.Status != "Failed" || b.Name != "unit-1" {
		t.Errorf("taskrun summary = %+v", b)
	}
}

func TestRunsNoTokenEmpty(t *testing.T) {
	gw := fakeGateway(t)
	defer gw.Close()
	rr := do(NewHandler(Config{URL: gw.URL}), "/api/results/runs", false)
	if rr.Code != 200 || strings.TrimSpace(rr.Body.String()) != `{"runs":[]}` {
		t.Fatalf("code=%d body=%s", rr.Code, rr.Body)
	}
}

func TestLogsProxied(t *testing.T) {
	gw := fakeGateway(t)
	defer gw.Close()
	rr := do(NewHandler(Config{URL: gw.URL}), "/api/results/logs?record="+logName, true)
	if rr.Code != 200 || rr.Body.String() != "line one\nline two\n" {
		t.Fatalf("code=%d body=%q", rr.Code, rr.Body)
	}
	if ct := rr.Header().Get("Content-Type"); !strings.HasPrefix(ct, "text/plain") {
		t.Errorf("content-type = %q", ct)
	}
}

func TestRunDecoded(t *testing.T) {
	gw := fakeGateway(t)
	defer gw.Close()
	rr := do(NewHandler(Config{URL: gw.URL}), "/api/results/run?record="+recName, true)
	if rr.Code != 200 || rr.Body.String() != prObj {
		t.Fatalf("code=%d body=%s", rr.Code, rr.Body)
	}
}

func TestConfig(t *testing.T) {
	gw := fakeGateway(t)
	defer gw.Close()
	if rr := do(NewHandler(Config{URL: gw.URL}), "/api/results/config", false); strings.TrimSpace(rr.Body.String()) != `{"enabled":true}` {
		t.Errorf("configured: %s", rr.Body)
	}
	if rr := do(NewHandler(Config{}), "/api/results/config", false); rr.Code != 200 || strings.TrimSpace(rr.Body.String()) != `{"enabled":false}` {
		t.Errorf("unconfigured: %d %s", rr.Code, rr.Body)
	}
}

func TestValidationAndErrors(t *testing.T) {
	gw := fakeGateway(t)
	defer gw.Close()
	h := NewHandler(Config{URL: gw.URL})
	for _, p := range []string{
		"/api/results/logs?record=",
		"/api/results/logs?record=../../x",
		"/api/results/logs?record=dev/results/r1/records/x", // wrong kind
		"/api/results/run?record=dev/results/../records/x",
		"/api/results/runs?kind=Bogus",
		"/api/results/runs?namespace=a/b",
	} {
		if rr := do(h, p, true); rr.Code != http.StatusBadRequest {
			t.Errorf("%s = %d, want 400", p, rr.Code)
		}
	}
	if rr := do(h, "/api/results/logs?record=dev/results/r1/logs/missing", true); rr.Code != http.StatusNotFound {
		t.Errorf("missing log = %d, want 404", rr.Code)
	}
	req := httptest.NewRequest(http.MethodPost, "/api/results/runs", nil)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusMethodNotAllowed {
		t.Errorf("POST = %d, want 405", rr.Code)
	}
}
