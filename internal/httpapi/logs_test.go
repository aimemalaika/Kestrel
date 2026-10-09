package httpapi

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

	"k8s.io/apimachinery/pkg/runtime"
	discfake "k8s.io/client-go/discovery/fake"
	dynfake "k8s.io/client-go/dynamic/fake"
	kubefake "k8s.io/client-go/kubernetes/fake"

	"github.com/aimemalaika/Kestrel/internal/k8s"
)

type spyLogs struct {
	ns, pod string
	opts    k8s.LogOptions
	rc      io.ReadCloser
	err     error
}

func (s *spyLogs) Stream(_ context.Context, ns, pod string, o k8s.LogOptions) (io.ReadCloser, error) {
	s.ns, s.pod, s.opts = ns, pod, o
	return s.rc, s.err
}

func logsHandler(l k8s.LogStreamer) http.Handler {
	d := DefaultDeps()
	d.Logs = l
	return New(d)
}

const logPath = "/api/logs/core/v1/namespaces/default/pods/web-1"

func TestLogsRealStreamerOverFakeClientset(t *testing.T) {
	acc := k8s.NewAccessorFromAll(dynfake.NewSimpleDynamicClient(runtime.NewScheme()), &discfake.FakeDiscovery{}, kubefake.NewSimpleClientset())
	h := logsHandler(k8s.NewRealLogs(acc))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest("GET", logPath, nil))
	if ct := rec.Header().Get("Content-Type"); ct != "text/event-stream" {
		t.Fatalf("content-type %q", ct)
	}
	if rec.Body.String() != "data: fake logs\n\n" {
		t.Fatalf("body %q", rec.Body.String())
	}
}

func TestLogsFramesEachLine(t *testing.T) {
	spy := &spyLogs{rc: io.NopCloser(strings.NewReader("a\r\nb\n\nc"))}
	rec := httptest.NewRecorder()
	logsHandler(spy).ServeHTTP(rec, httptest.NewRequest("GET", logPath, nil))
	if want := "data: a\n\ndata: b\n\ndata: \n\ndata: c\n\n"; rec.Body.String() != want {
		t.Fatalf("body %q", rec.Body.String())
	}
}

func TestLogsOptionsParsed(t *testing.T) {
	spy := &spyLogs{rc: io.NopCloser(strings.NewReader(""))}
	h := logsHandler(spy)
	h.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest("GET", logPath+"?container=c1&follow=false&tailLines=10&sinceSeconds=60", nil))
	o := spy.opts
	if spy.ns != "default" || spy.pod != "web-1" || o.Container != "c1" || o.Follow ||
		o.TailLines == nil || *o.TailLines != 10 || o.SinceSeconds == nil || *o.SinceSeconds != 60 {
		t.Fatalf("ns=%q pod=%q opts=%+v", spy.ns, spy.pod, o)
	}
	// Defaults: follow true, no tail/since.
	spy.rc = io.NopCloser(strings.NewReader(""))
	h.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest("GET", logPath, nil))
	if !spy.opts.Follow || spy.opts.TailLines != nil || spy.opts.SinceSeconds != nil || spy.opts.Container != "" {
		t.Fatalf("defaults: %+v", spy.opts)
	}
}

func TestLogsBadNumericOption(t *testing.T) {
	rec := httptest.NewRecorder()
	logsHandler(&spyLogs{}).ServeHTTP(rec, httptest.NewRequest("GET", logPath+"?tailLines=abc", nil))
	if rec.Code != 400 {
		t.Fatalf("code %d", rec.Code)
	}
}

func TestLogsPodNotFound(t *testing.T) {
	spy := &spyLogs{err: k8s.NotFound("pods %q not found", "web-1")}
	rec := httptest.NewRecorder()
	logsHandler(spy).ServeHTTP(rec, httptest.NewRequest("GET", logPath, nil))
	if rec.Code != 404 {
		t.Fatalf("code %d", rec.Code)
	}
	var b ErrorBody
	if err := json.Unmarshal(rec.Body.Bytes(), &b); err != nil || b.Code != 404 || b.Reason != "NotFound" {
		t.Fatalf("body %q %v", rec.Body.String(), err)
	}
	if ct := rec.Header().Get("Content-Type"); strings.Contains(ct, "event-stream") {
		t.Fatalf("must not be SSE: %q", ct)
	}
}

type blockingBody struct {
	pr     *io.PipeReader
	closed chan struct{}
}

func (b *blockingBody) Read(p []byte) (int, error) { return b.pr.Read(p) }
func (b *blockingBody) Close() error {
	select {
	case <-b.closed:
	default:
		close(b.closed)
	}
	return b.pr.CloseWithError(io.EOF)
}

func TestLogsCancelStopsHandlerAndClosesUpstream(t *testing.T) {
	pr, pw := io.Pipe()
	defer pw.Close()
	body := &blockingBody{pr: pr, closed: make(chan struct{})}
	srv := httptest.NewServer(logsHandler(&spyLogs{rc: body}))
	defer srv.Close()

	ctx, cancel := context.WithCancel(context.Background())
	req, _ := http.NewRequestWithContext(ctx, "GET", srv.URL+logPath, nil)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	go func() { _, _ = pw.Write([]byte("live line\n")) }()
	br := bufio.NewReader(resp.Body)
	line, err := br.ReadString('\n')
	if err != nil || line != "data: live line\n" {
		t.Fatalf("got %q %v", line, err)
	}
	cancel()
	resp.Body.Close()
	select {
	case <-body.closed:
	case <-time.After(3 * time.Second):
		t.Fatal("upstream not closed after client disconnect")
	}
}
