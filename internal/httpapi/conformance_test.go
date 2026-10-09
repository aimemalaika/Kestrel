package httpapi_test

// Executable encoding of API-CONTRACT.md against the router.

import (
	"bufio"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/aimemalaika/Kestrel/internal/httpapi"
	"github.com/aimemalaika/Kestrel/internal/k8s"
	"github.com/aimemalaika/Kestrel/internal/resource"
	"github.com/aimemalaika/Kestrel/internal/stream"
)

func do(t *testing.T, h http.Handler, method, url, body string) *httptest.ResponseRecorder {
	t.Helper()
	var rd io.Reader
	if body != "" {
		rd = strings.NewReader(body)
	}
	req := httptest.NewRequest(method, url, rd)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func decode[T any](t *testing.T, rec *httptest.ResponseRecorder) T {
	t.Helper()
	var v T
	if err := json.Unmarshal(rec.Body.Bytes(), &v); err != nil {
		t.Fatalf("body not valid JSON: %v\n%s", err, rec.Body.String())
	}
	return v
}

func handler() http.Handler { return httpapi.New(httpapi.DefaultDeps()) }

func TestCatalogShape(t *testing.T) {
	rec := do(t, handler(), "GET", "/api/catalog", "")
	if rec.Code != 200 {
		t.Fatalf("status %d", rec.Code)
	}
	raw := decode[[]map[string]any](t, rec)
	if len(raw) == 0 {
		t.Fatal("catalog empty")
	}
	for _, e := range raw {
		for _, k := range []string{"group", "version", "resource", "kind", "namespaced", "verbs"} {
			if _, ok := e[k]; !ok {
				t.Errorf("catalog entry missing %q: %v", k, e)
			}
		}
		if _, ok := e["namespaced"].(bool); !ok {
			t.Errorf("namespaced not bool: %v", e)
		}
		if _, ok := e["verbs"].([]any); !ok {
			t.Errorf("verbs not array: %v", e)
		}
	}
	// The internal empty group must surface on the wire as "core" (contract §1).
	var sawCore bool
	for _, e := range raw {
		if e["resource"] == "pods" {
			if e["group"] != "core" {
				t.Errorf("pods group on wire = %v, want \"core\"", e["group"])
			}
			sawCore = true
		}
	}
	if !sawCore {
		t.Error("no core/v1 entry to verify empty-group -> core mapping")
	}
}

func TestListAndGetRoutes(t *testing.T) {
	h := handler()
	cases := []struct {
		url   string
		array bool
	}{
		{"/api/core/v1/nodes", true},
		{"/api/apps/v1/namespaces/default/deployments", true},
		{"/api/core/v1/nodes/n1", false},
		{"/api/apps/v1/namespaces/default/deployments/web", false},
		{"/api/core/v1/namespaces/default", false}, // Namespace resource get, not a list
	}
	for _, c := range cases {
		rec := do(t, h, "GET", c.url, "")
		if rec.Code != 200 {
			t.Errorf("%s: status %d", c.url, rec.Code)
			continue
		}
		if c.array {
			decode[[]map[string]any](t, rec)
		} else if m := decode[map[string]any](t, rec); m["metadata"] == nil {
			t.Errorf("%s: object missing metadata", c.url)
		}
	}
}

func TestCoreGroupMapsToEmpty(t *testing.T) {
	var got k8s.Ref
	d := httpapi.DefaultDeps()
	d.Resources = resource.NewService(refSpy{Stub: k8s.Stub{}, out: &got})
	do(t, httpapi.New(d), "GET", "/api/core/v1/namespaces/ns1/pods/p1", "")
	if got.Group != "" || got.Namespace != "ns1" || got.Resource != "pods" || got.Name != "p1" {
		t.Errorf("unexpected ref %+v", got)
	}
}

type refSpy struct {
	k8s.Stub
	out *k8s.Ref
}

func (s refSpy) Get(_ context.Context, ref k8s.Ref) (k8s.Object, error) {
	*s.out = ref
	return k8s.StubObject(ref), nil
}

func TestApplyEchoesAndHonorsDryRun(t *testing.T) {
	h := handler()
	body := `{"apiVersion":"v1","kind":"ConfigMap","metadata":{"name":"c","namespace":"default"}}`
	for _, url := range []string{"/api/apply", "/api/apply?dryRun=true"} {
		rec := do(t, h, "PUT", url, body)
		if rec.Code != 200 {
			t.Fatalf("%s: status %d", url, rec.Code)
		}
		if m := decode[map[string]any](t, rec); m["kind"] != "ConfigMap" {
			t.Errorf("%s: not echoed: %v", url, m)
		}
	}
	if rec := do(t, h, "POST", "/api/apply", body); rec.Code != 405 {
		t.Errorf("POST apply should be 405, got %d", rec.Code)
	}
	if rec := do(t, h, "PUT", "/api/apply", "{not json"); rec.Code != 400 {
		t.Errorf("bad body should be 400, got %d", rec.Code)
	}
}

type dryRunSpy struct {
	k8s.Stub
	apply, del *bool
}

func (s dryRunSpy) Apply(_ context.Context, o k8s.Object, dry bool) (k8s.Object, error) {
	*s.apply = dry
	return o, nil
}
func (s dryRunSpy) Delete(_ context.Context, _ k8s.Ref, dry bool) error {
	*s.del = dry
	return nil
}

func TestDryRunReachesClient(t *testing.T) {
	var a, d bool
	deps := httpapi.DefaultDeps()
	deps.Resources = resource.NewService(dryRunSpy{apply: &a, del: &d})
	h := httpapi.New(deps)
	do(t, h, "PUT", "/api/apply?dryRun=true", `{"kind":"X"}`)
	do(t, h, "DELETE", "/api/core/v1/namespaces/default/pods/p?dryRun=true", "")
	if !a || !d {
		t.Errorf("dryRun=true not propagated: apply=%v delete=%v", a, d)
	}
	// Default (no ?dryRun) must reach the client as false.
	do(t, h, "PUT", "/api/apply", `{"kind":"X"}`)
	do(t, h, "DELETE", "/api/core/v1/namespaces/default/pods/p", "")
	if a || d {
		t.Errorf("dryRun should default to false: apply=%v delete=%v", a, d)
	}
}

// canISpy captures the request the k8s layer receives.
type canISpy struct {
	k8s.Stub
	got *k8s.CanIRequest
}

func (s canISpy) CanI(_ context.Context, req k8s.CanIRequest) (bool, error) {
	*s.got = req
	return true, nil
}

func TestCanIGroupMapsToEmpty(t *testing.T) {
	var got k8s.CanIRequest
	deps := httpapi.DefaultDeps()
	deps.Resources = resource.NewService(canISpy{got: &got})
	do(t, httpapi.New(deps), "POST", "/api/can-i",
		`{"verb":"delete","group":"core","version":"v1","resource":"pods","namespace":"ns1","name":"p1"}`)
	if got.Group != "" {
		t.Errorf("wire group \"core\" should reach the client as \"\", got %q", got.Group)
	}
	if got.Resource != "pods" || got.Namespace != "ns1" {
		t.Errorf("can-i request mis-decoded: %+v", got)
	}
}

func TestDelete(t *testing.T) {
	h := handler()
	for _, url := range []string{
		"/api/core/v1/namespaces/default/pods/p",
		"/api/core/v1/namespaces/default/pods/p?dryRun=true",
	} {
		if rec := do(t, h, "DELETE", url, ""); rec.Code != 200 && rec.Code != 204 {
			t.Errorf("%s: status %d", url, rec.Code)
		}
	}
	if rec := do(t, h, "DELETE", "/api/core/v1/pods", ""); rec.Code != 405 {
		t.Errorf("delete without name should be 405, got %d", rec.Code)
	}
}

func TestCanI(t *testing.T) {
	rec := do(t, handler(), "POST", "/api/can-i",
		`{"verb":"delete","group":"tekton.dev","version":"v1","resource":"pipelineruns","namespace":"ci","name":"build-42"}`)
	if rec.Code != 200 {
		t.Fatalf("status %d", rec.Code)
	}
	m := decode[map[string]any](t, rec)
	if _, ok := m["allowed"].(bool); !ok || len(m) != 1 {
		t.Errorf("want exactly {allowed:bool}, got %v", m)
	}
}

func readSSE(t *testing.T, rec *httptest.ResponseRecorder) []stream.Envelope {
	t.Helper()
	if ct := rec.Header().Get("Content-Type"); ct != "text/event-stream" {
		t.Fatalf("content-type %q", ct)
	}
	var out []stream.Envelope
	sc := bufio.NewScanner(rec.Body)
	for sc.Scan() {
		line := sc.Text()
		if line == "" {
			continue
		}
		payload, ok := strings.CutPrefix(line, "data: ")
		if !ok {
			t.Fatalf("non-data line %q", line)
		}
		var e stream.Envelope
		if err := json.Unmarshal([]byte(payload), &e); err != nil {
			t.Fatalf("unparseable frame %q: %v", payload, err)
		}
		out = append(out, e)
	}
	return out
}

func TestStreamEnvelope(t *testing.T) {
	envs := readSSE(t, do(t, handler(), "GET", "/api/stream/core/v1/namespaces/default/pods", ""))
	if len(envs) < 2 {
		t.Fatalf("want added burst + bookmark, got %d frames", len(envs))
	}
	last := envs[len(envs)-1]
	if last.Type != stream.Bookmark || last.ResourceVersion == "" {
		t.Errorf("last frame should be bookmark with resourceVersion: %+v", last)
	}
	for _, e := range envs[:len(envs)-1] {
		if e.Type != stream.Added || e.Object["metadata"] == nil {
			t.Errorf("initial sync must be added+object: %+v", e)
		}
	}
}

type allTypes struct{}

func (allTypes) Watch(context.Context, k8s.Ref) (<-chan stream.Envelope, error) {
	ch := make(chan stream.Envelope, 5)
	o := k8s.Object{"metadata": map[string]any{"name": "x"}}
	ch <- stream.Envelope{Type: stream.Added, Object: o}
	ch <- stream.Envelope{Type: stream.Modified, Object: o}
	ch <- stream.Envelope{Type: stream.Deleted, Object: o}
	ch <- stream.Envelope{Type: stream.Bookmark, ResourceVersion: "9"}
	ch <- stream.Envelope{Type: stream.Error, Message: "watch expired, resync required"}
	close(ch)
	return ch, nil
}

func TestStreamEncodesEveryEnvelopeType(t *testing.T) {
	d := httpapi.DefaultDeps()
	d.Stream = allTypes{}
	envs := readSSE(t, do(t, httpapi.New(d), "GET", "/api/stream/core/v1/pods", ""))
	want := []string{"added", "modified", "deleted", "bookmark", "error"}
	if len(envs) != len(want) {
		t.Fatalf("got %d frames", len(envs))
	}
	for i, w := range want {
		if envs[i].Type != w {
			t.Errorf("frame %d type %q want %q", i, envs[i].Type, w)
		}
	}
	if envs[4].Message == "" || envs[3].ResourceVersion != "9" {
		t.Errorf("error/bookmark payload lost: %+v %+v", envs[3], envs[4])
	}
}

func TestLogsSSE(t *testing.T) {
	rec := do(t, handler(), "GET", "/api/logs/core/v1/namespaces/default/pods/p", "")
	if ct := rec.Header().Get("Content-Type"); ct != "text/event-stream" {
		t.Fatalf("content-type %q", ct)
	}
	if n := strings.Count(rec.Body.String(), "data: "); n < 1 {
		t.Errorf("no log frames")
	}
}

func TestWebSocketRoutesRegistered(t *testing.T) {
	for _, p := range []string{"/api/exec/core/v1/namespaces/d/pods/p", "/api/port-forward/core/v1/namespaces/d/pods/p"} {
		rec := do(t, handler(), "GET", p, "")
		if rec.Code != 501 {
			t.Errorf("%s: want 501, got %d", p, rec.Code)
		}
		if b := decode[httpapi.ErrorBody](t, rec); b.Code != 501 || b.Reason == "" {
			t.Errorf("%s: bad error body %+v", p, b)
		}
	}
}

func TestModulePrefixes(t *testing.T) {
	h := handler()
	for _, p := range []string{"/api/registry/repos", "/api/helm/releases", "/api/argo/apps"} {
		if rec := do(t, h, "GET", p, ""); rec.Code != 200 {
			t.Errorf("%s: %d", p, rec.Code)
		} else {
			decode[map[string]any](t, rec)
		}
	}
	if rec := do(t, h, "GET", "/api/servicemap", ""); rec.Code != 200 {
		t.Errorf("GET servicemap %d", rec.Code)
	}
	if rec := do(t, h, "PUT", "/api/servicemap", "services: []"); rec.Code != 200 {
		t.Errorf("PUT servicemap %d", rec.Code)
	}
}

type failing struct {
	k8s.Stub
	err error
}

func (f failing) Get(context.Context, k8s.Ref) (k8s.Object, error) { return nil, f.err }

func TestErrorMapping(t *testing.T) {
	cases := []struct {
		err    error
		code   int
		reason string
	}{
		{k8s.NotFound(`pipelineruns.tekton.dev "build-42" not found`), 404, "NotFound"},
		{k8s.Forbidden("forbidden"), 403, "Forbidden"},
		{k8s.Conflict("conflict"), 409, "Conflict"},
		{io.ErrUnexpectedEOF, 500, "InternalError"},
	}
	for _, c := range cases {
		d := httpapi.DefaultDeps()
		d.Resources = resource.NewService(failing{err: c.err})
		rec := do(t, httpapi.New(d), "GET", "/api/tekton.dev/v1/namespaces/ci/pipelineruns/build-42", "")
		if rec.Code != c.code {
			t.Errorf("%v: status %d want %d", c.err, rec.Code, c.code)
		}
		if ct := rec.Header().Get("Content-Type"); !strings.HasPrefix(ct, "application/json") {
			t.Errorf("content-type %q", ct)
		}
		b := decode[map[string]any](t, rec)
		if b["error"] == "" || int(b["code"].(float64)) != c.code || b["reason"] != c.reason {
			t.Errorf("bad body %v", b)
		}
	}
}

// blockingSource emits nothing and only closes its channel when ctx is cancelled,
// exercising the Source cancellation contract (the goroutine-leak guard for B1).
type blockingSource struct{ started chan struct{} }

func (b blockingSource) Watch(ctx context.Context, _ k8s.Ref) (<-chan stream.Envelope, error) {
	ch := make(chan stream.Envelope)
	go func() {
		close(b.started)
		<-ctx.Done()
		close(ch)
	}()
	return ch, nil
}

func TestStreamStopsOnCancel(t *testing.T) {
	deps := httpapi.DefaultDeps()
	started := make(chan struct{})
	deps.Stream = blockingSource{started: started}
	h := httpapi.New(deps)

	ctx, cancel := context.WithCancel(context.Background())
	req := httptest.NewRequest("GET", "/api/stream/core/v1/namespaces/default/pods", nil).WithContext(ctx)
	rec := httptest.NewRecorder()

	done := make(chan struct{})
	go func() { h.ServeHTTP(rec, req); close(done) }()

	<-started
	cancel()
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("stream handler did not return after context cancel (goroutine leak)")
	}
}
