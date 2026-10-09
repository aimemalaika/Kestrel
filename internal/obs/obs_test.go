package obs

import (
	"bufio"
	"bytes"
	"encoding/json"
	"log/slog"
	"net"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/prometheus/client_golang/prometheus/testutil"

	"github.com/aimemalaika/Kestrel/internal/auth"
	"github.com/aimemalaika/Kestrel/internal/stream"
)

// --- classify -----------------------------------------------------------

func TestClassify(t *testing.T) {
	cases := []struct {
		path string
		want string
	}{
		{"/api/core/v1/namespaces/foo/pods/bar", groupAPIResource},
		{"/api/apps/v1/deployments", groupAPIResource},
		{"/api/stream/core/v1/pods", groupAPIStream},
		{"/api/logs/core/v1/namespaces/n/pods/p", groupAPILogs},
		{"/api/exec/core/v1/namespaces/n/pods/p", groupAPIExec},
		{"/api/port-forward/core/v1/namespaces/n/pods/p", groupAPIPortForward},
		{"/api/catalog", groupCatalog},
		{"/api/apply", groupApply},
		{"/api/can-i", groupCanI},
		{"/api/registry/v2/foo/manifests/latest", groupRegistry},
		{"/api/helm/releases", groupHelm},
		{"/auth/login", groupAuth},
		{"/auth/callback", groupAuth},
		{"/", groupSPA},
		{"/index.html", groupSPA},
		{"/assets/app.js", groupSPA},
	}
	for _, c := range cases {
		if got := classify(c.path); got != c.want {
			t.Errorf("classify(%q) = %q, want %q", c.path, got, c.want)
		}
	}
	// Low cardinality: every group must be from the fixed set.
	allowed := map[string]bool{
		groupAPIResource: true, groupAPIStream: true, groupAPILogs: true,
		groupAPIExec: true, groupAPIPortForward: true, groupCatalog: true,
		groupApply: true, groupCanI: true, groupRegistry: true, groupHelm: true,
		groupAuth: true, groupSPA: true, groupOther: true,
	}
	for _, c := range cases {
		if !allowed[classify(c.path)] {
			t.Errorf("classify(%q) escaped the fixed group set", c.path)
		}
	}
}

// --- response writer interface preservation -----------------------------

// fakeRW implements http.ResponseWriter + http.Flusher + http.Hijacker, so the
// wrapper's Hijack path can be exercised (httptest.ResponseRecorder is not a
// Hijacker).
type fakeRW struct {
	*httptest.ResponseRecorder
	flushed  bool
	hijacked bool
}

func (f *fakeRW) Flush() { f.flushed = true }
func (f *fakeRW) Hijack() (net.Conn, *bufio.ReadWriter, error) {
	f.hijacked = true
	c1, _ := net.Pipe()
	return c1, bufio.NewReadWriter(bufio.NewReader(c1), bufio.NewWriter(c1)), nil
}

func TestResponseWriterPreservesInterfaces(t *testing.T) {
	// Inner supports both Flusher and Hijacker → wrapper must too.
	inner := &fakeRW{ResponseRecorder: httptest.NewRecorder()}
	ww := wrapWriter(inner)

	if _, ok := any(ww).(http.Flusher); !ok {
		t.Fatal("wrapped writer does not satisfy http.Flusher")
	}
	if _, ok := any(ww).(http.Hijacker); !ok {
		t.Fatal("wrapped writer does not satisfy http.Hijacker")
	}

	ww.Flush()
	if !inner.flushed {
		t.Error("Flush did not forward to inner flusher")
	}
	if _, _, err := ww.Hijack(); err != nil {
		t.Errorf("Hijack returned error: %v", err)
	}
	if !inner.hijacked {
		t.Error("Hijack did not forward to inner hijacker")
	}
	if ww.Status() != http.StatusSwitchingProtocols {
		t.Errorf("status after hijack = %d, want 101", ww.Status())
	}
}

func TestResponseWriterHijackOnNonHijacker(t *testing.T) {
	// httptest.ResponseRecorder is a Flusher but NOT a Hijacker. Hijack must
	// return an error, never panic.
	ww := wrapWriter(httptest.NewRecorder())
	if _, _, err := ww.Hijack(); err == nil {
		t.Error("expected error hijacking a non-hijacker inner")
	}
}

// --- SSE through the full middleware chain -------------------------------

func TestSSEFlushThroughChain(t *testing.T) {
	m := NewMetrics()
	limiter := NewRateLimiter(0, 0, false) // disabled, pure pass-through

	// Handler drives stream.Begin (which type-asserts http.Flusher) and writes a
	// frame — exactly what /api/stream does.
	h := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		sw := stream.Begin(w)
		if sw == nil {
			t.Error("stream.Begin returned nil: Flusher lost through the chain")
			w.WriteHeader(500)
			return
		}
		_ = sw.Raw("hello")
	})

	var handler http.Handler = h
	handler = limiter.Middleware(handler)
	handler = m.Middleware(handler)
	handler = RequestLogger(handler, false)
	handler = Recovery(handler)

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/stream/core/v1/pods", nil)
	handler.ServeHTTP(rec, req)

	if !rec.Flushed {
		t.Error("response was not flushed through the chain (SSE broken)")
	}
	if !strings.Contains(rec.Body.String(), "data: hello") {
		t.Errorf("body missing SSE frame: %q", rec.Body.String())
	}
	if ct := rec.Header().Get("Content-Type"); ct != "text/event-stream" {
		t.Errorf("content-type = %q, want text/event-stream", ct)
	}
	// Stream path: counted but NOT in the latency histogram.
	if got := testutil.CollectAndCount(m.duration); got != 0 {
		t.Errorf("stream request recorded in latency histogram (%d series)", got)
	}
	if got := testutil.ToFloat64(m.requests.WithLabelValues(http.MethodGet, groupAPIStream, "200")); got != 1 {
		t.Errorf("stream request counter = %v, want 1", got)
	}
}

// --- metrics middleware --------------------------------------------------

func TestMetricsMiddlewareCountsAndTimes(t *testing.T) {
	m := NewMetrics()
	h := m.Middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// in-flight must be 1 while serving.
		if got := testutil.ToFloat64(m.inFlight); got != 1 {
			t.Errorf("in-flight during request = %v, want 1", got)
		}
		w.WriteHeader(http.StatusTeapot)
	}))

	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/catalog", nil))

	if got := testutil.ToFloat64(m.inFlight); got != 0 {
		t.Errorf("in-flight after request = %v, want 0", got)
	}
	if got := testutil.ToFloat64(m.requests.WithLabelValues(http.MethodGet, groupCatalog, "418")); got != 1 {
		t.Errorf("catalog 418 counter = %v, want 1", got)
	}
	if got := testutil.CollectAndCount(m.duration); got != 1 {
		t.Errorf("duration histogram series = %d, want 1 (non-stream timed)", got)
	}
}

func TestMetricsActiveStreamsGauge(t *testing.T) {
	m := NewMetrics()
	done := make(chan struct{})
	h := m.Middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if got := testutil.ToFloat64(m.activeStreams); got != 1 {
			t.Errorf("active_streams during stream = %v, want 1", got)
		}
		close(done)
	}))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/logs/core/v1/namespaces/n/pods/p", nil))
	<-done
	if got := testutil.ToFloat64(m.activeStreams); got != 0 {
		t.Errorf("active_streams after stream = %v, want 0", got)
	}
}

func TestMetricsHandlerExposes(t *testing.T) {
	m := NewMetrics()
	m.requests.WithLabelValues("GET", groupCatalog, "200").Inc()
	rec := httptest.NewRecorder()
	m.Handler().ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/metrics", nil))
	if rec.Code != 200 {
		t.Fatalf("/metrics status = %d", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), "kestrel_http_requests_total") {
		t.Error("/metrics output missing kestrel_http_requests_total")
	}
}

// --- method label cardinality -------------------------------------------

func TestClassifyMethod(t *testing.T) {
	// The canonical methods pass through unchanged.
	for _, m := range []string{"GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"} {
		if got := classifyMethod(m); got != m {
			t.Errorf("classifyMethod(%q) = %q, want %q", m, got, m)
		}
	}
	// Everything else — garbage, lowercase, unknown verbs — collapses to "other".
	for _, m := range []string{"FOOBAR", "get", "Get", "TRACE", "CONNECT", "", "GET ", "gEt"} {
		if got := classifyMethod(m); got != "other" {
			t.Errorf("classifyMethod(%q) = %q, want \"other\"", m, got)
		}
	}
}

// TestMetricsMethodLabelBounded drives the middleware with attacker-controlled
// methods and asserts the "method" label stays within the fixed set: garbage
// methods land on "other", so the requests series set never grows unbounded.
func TestMetricsMethodLabelBounded(t *testing.T) {
	m := NewMetrics()
	h := m.Middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	for _, method := range []string{"FOOBAR", "get", "WHATEVER", "\x00evil", "lowercasepost"} {
		req := httptest.NewRequest(http.MethodGet, "/api/catalog", nil)
		req.Method = method // bypass httptest's validation
		h.ServeHTTP(httptest.NewRecorder(), req)
	}

	// All garbage methods must have folded into a single "other" series.
	if got := testutil.ToFloat64(m.requests.WithLabelValues("other", groupCatalog, "200")); got != 5 {
		t.Errorf("other-method counter = %v, want 5 (all garbage folded)", got)
	}
	// Bounded: exactly one requests series exists (the single "other" one).
	if got := testutil.CollectAndCount(m.requests); got != 1 {
		t.Errorf("requests series count = %d, want 1 (label set stayed bounded)", got)
	}
}

// --- end-to-end hijack through the full chain ---------------------------

// TestHijackThroughFullChain composes the FULL middleware chain exactly as main
// does (Recovery → RequestLogger → Metrics.Middleware → pass-through authn →
// RateLimiter.Middleware → handler) and asserts a handler can still type-assert
// its ResponseWriter to http.Hijacker and Hijack() successfully — i.e. the WS
// upgrade survives every wrapper. It also checks the wrapper recorded status 101.
func TestHijackThroughFullChain(t *testing.T) {
	m := NewMetrics()
	rl := NewRateLimiter(100, 100, false) // enabled, generous burst
	defer rl.Close()

	var (
		hijackOK    bool
		gotConn     net.Conn
		passthrough bool
	)
	h := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hj, ok := w.(http.Hijacker)
		if !ok {
			t.Error("handler's ResponseWriter is not an http.Hijacker (lost through chain)")
			return
		}
		conn, _, err := hj.Hijack()
		if err != nil {
			t.Errorf("Hijack through chain failed: %v", err)
			return
		}
		hijackOK = true
		gotConn = conn
	})

	// Pass-through "authn" that just forwards, mirroring main's optional authnMW.
	authn := func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			passthrough = true
			next.ServeHTTP(w, r)
		})
	}

	var handler http.Handler = h
	handler = rl.Middleware(handler)
	handler = authn(handler)
	handler = m.Middleware(handler)
	handler = RequestLogger(handler, false)
	handler = Recovery(handler)

	inner := &fakeRW{ResponseRecorder: httptest.NewRecorder()}
	req := httptest.NewRequest(http.MethodGet, "/api/exec/core/v1/namespaces/n/pods/p", nil)
	handler.ServeHTTP(inner, req)

	if !passthrough {
		t.Error("request never reached the pass-through authn layer")
	}
	if !hijackOK {
		t.Fatal("handler could not hijack through the full chain")
	}
	if !inner.hijacked {
		t.Error("Hijack did not reach the fake writer's conn")
	}
	if gotConn == nil {
		t.Error("Hijack returned a nil conn")
	} else {
		_ = gotConn.Close()
	}
	// The wrapper records 101 on hijack (WriteHeader is never called on upgrade).
	if got := testutil.ToFloat64(m.requests.WithLabelValues(http.MethodGet, groupAPIExec, "101")); got != 1 {
		t.Errorf("exec hijack counter{code=101} = %v, want 1", got)
	}
}

// --- rate limiter --------------------------------------------------------

func doReq(h http.Handler, remote string, id *auth.Identity) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodGet, "/api/catalog", nil)
	req.RemoteAddr = remote
	if id != nil {
		req = req.WithContext(auth.WithIdentity(req.Context(), *id))
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func TestRateLimiterBurstThen429(t *testing.T) {
	rl := NewRateLimiter(1, 3, false) // 1 rps, burst 3
	defer rl.Close()
	h := rl.Middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	for i := 0; i < 3; i++ {
		if rec := doReq(h, "10.0.0.1:1234", nil); rec.Code != 200 {
			t.Fatalf("request %d within burst = %d, want 200", i, rec.Code)
		}
	}
	rec := doReq(h, "10.0.0.1:1234", nil)
	if rec.Code != http.StatusTooManyRequests {
		t.Fatalf("request past burst = %d, want 429", rec.Code)
	}
	if ra := rec.Header().Get("Retry-After"); ra == "" {
		t.Error("429 missing Retry-After header")
	}
	var body map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("429 body not JSON: %v", err)
	}
	if body["reason"] != "TooManyRequests" || body["code"].(float64) != 429 || body["error"] == "" {
		t.Errorf("429 body not contract-shaped: %v", body)
	}
}

func TestRateLimiterIndependentKeys(t *testing.T) {
	rl := NewRateLimiter(1, 1, false) // burst 1: the 2nd request on a key 429s
	defer rl.Close()
	h := rl.Middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {}))

	// Two different IPs each get their own bucket.
	if rec := doReq(h, "10.0.0.1:1", nil); rec.Code != 200 {
		t.Fatalf("ip1 first = %d", rec.Code)
	}
	if rec := doReq(h, "10.0.0.2:1", nil); rec.Code != 200 {
		t.Fatalf("ip2 first = %d (should be independent bucket)", rec.Code)
	}
	if rec := doReq(h, "10.0.0.1:1", nil); rec.Code != 429 {
		t.Fatalf("ip1 second = %d, want 429", rec.Code)
	}
	// An authenticated user is keyed separately from any IP.
	alice := auth.Identity{User: "alice"}
	if rec := doReq(h, "10.0.0.1:1", &alice); rec.Code != 200 {
		t.Fatalf("alice first (own bucket) = %d, want 200", rec.Code)
	}
	if rec := doReq(h, "10.0.0.9:1", &alice); rec.Code != 429 {
		t.Fatalf("alice second = %d, want 429 (keyed by user, not IP)", rec.Code)
	}
}

func TestRateLimiterDisabled(t *testing.T) {
	rl := NewRateLimiter(0, 0, false) // disabled
	if rl != nil {
		t.Fatal("rps<=0 should yield a nil (disabled) limiter")
	}
	h := rl.Middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	for i := 0; i < 50; i++ {
		if rec := doReq(h, "10.0.0.1:1", nil); rec.Code != 200 {
			t.Fatalf("disabled limiter blocked request %d (%d)", i, rec.Code)
		}
	}
}

func TestRateLimiterEvictsIdle(t *testing.T) {
	rl := NewRateLimiter(1, 1, false)
	defer rl.Close()
	now := time.Now()
	rl.now = func() time.Time { return now }
	rl.idleTTL = time.Minute

	rl.limiterFor("ip:1.2.3.4")
	if len(rl.buckets) != 1 {
		t.Fatalf("buckets = %d, want 1", len(rl.buckets))
	}
	now = now.Add(2 * time.Minute) // advance past idleTTL
	rl.evictIdle()
	if len(rl.buckets) != 0 {
		t.Errorf("idle bucket not evicted: %d remain", len(rl.buckets))
	}
}

// --- logging: no secrets -------------------------------------------------

func TestRequestLoggerNeverLogsSecrets(t *testing.T) {
	var buf bytes.Buffer
	prev := slog.Default()
	slog.SetDefault(slog.New(slog.NewJSONHandler(&buf, &slog.HandlerOptions{Level: slog.LevelDebug})))
	defer slog.SetDefault(prev)

	const secret = "Bearer super-secret-token-value"
	h := RequestLogger(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}), false)
	req := httptest.NewRequest(http.MethodGet, "/api/catalog", nil)
	req.Header.Set("Authorization", secret)
	req.RemoteAddr = "203.0.113.5:4444"
	req = req.WithContext(auth.WithIdentity(req.Context(), auth.Identity{
		User:  "alice@example.com",
		Token: "id-token-should-never-appear",
	}))
	h.ServeHTTP(httptest.NewRecorder(), req)

	out := buf.String()
	for _, forbidden := range []string{"super-secret-token-value", "id-token-should-never-appear", "Bearer"} {
		if strings.Contains(out, forbidden) {
			t.Errorf("log output leaked secret %q: %s", forbidden, out)
		}
	}
	// It should still log the useful, safe fields.
	if !strings.Contains(out, "alice@example.com") {
		t.Errorf("log missing user field: %s", out)
	}
	if !strings.Contains(out, "203.0.113.5") {
		t.Errorf("log missing remote_ip field: %s", out)
	}
}

func TestClientIPForwardedFor(t *testing.T) {
	// trustProxy=true honors the first XFF hop.
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.RemoteAddr = "10.0.0.1:5555"
	req.Header.Set("X-Forwarded-For", "198.51.100.7, 10.0.0.1")
	if got := ClientIP(req, true); got != "198.51.100.7" {
		t.Errorf("ClientIP(trust) XFF first hop = %q, want 198.51.100.7", got)
	}
	// trustProxy=false IGNORES XFF and uses RemoteAddr, so a forged header can't
	// spoof the IP (rate-limit bypass / log spoofing protection).
	if got := ClientIP(req, false); got != "10.0.0.1" {
		t.Errorf("ClientIP(no-trust) with forged XFF = %q, want 10.0.0.1 (RemoteAddr)", got)
	}

	// trustProxy=true falls back to X-Real-Ip when XFF is absent.
	reqXRI := httptest.NewRequest(http.MethodGet, "/", nil)
	reqXRI.RemoteAddr = "10.0.0.1:5555"
	reqXRI.Header.Set("X-Real-Ip", "203.0.113.42")
	if got := ClientIP(reqXRI, true); got != "203.0.113.42" {
		t.Errorf("ClientIP(trust) X-Real-Ip = %q, want 203.0.113.42", got)
	}
	if got := ClientIP(reqXRI, false); got != "10.0.0.1" {
		t.Errorf("ClientIP(no-trust) with X-Real-Ip = %q, want 10.0.0.1", got)
	}

	req2 := httptest.NewRequest(http.MethodGet, "/", nil)
	req2.RemoteAddr = "192.0.2.9:6666"
	if got := ClientIP(req2, false); got != "192.0.2.9" {
		t.Errorf("ClientIP RemoteAddr = %q, want 192.0.2.9", got)
	}
}

// TestRateLimiterXFFNoBypass locks in that with trustProxy=false a client
// rotating X-Forwarded-For does NOT get a fresh bucket per request: all
// requests from one RemoteAddr share a key and the burst still 429s.
func TestRateLimiterXFFNoBypass(t *testing.T) {
	rl := NewRateLimiter(1, 1, false) // burst 1
	defer rl.Close()
	h := rl.Middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {}))

	req1 := httptest.NewRequest(http.MethodGet, "/api/catalog", nil)
	req1.RemoteAddr = "10.0.0.1:1111"
	req1.Header.Set("X-Forwarded-For", "1.1.1.1")
	rec1 := httptest.NewRecorder()
	h.ServeHTTP(rec1, req1)
	if rec1.Code != 200 {
		t.Fatalf("first = %d, want 200", rec1.Code)
	}
	// Different forged XFF, same RemoteAddr: must still 429 (same key).
	req2 := httptest.NewRequest(http.MethodGet, "/api/catalog", nil)
	req2.RemoteAddr = "10.0.0.1:2222"
	req2.Header.Set("X-Forwarded-For", "2.2.2.2")
	rec2 := httptest.NewRecorder()
	h.ServeHTTP(rec2, req2)
	if rec2.Code != http.StatusTooManyRequests {
		t.Fatalf("second (rotated XFF, same RemoteAddr) = %d, want 429 (no bypass)", rec2.Code)
	}
}

// TestRateLimiterMaxKeysBound verifies the bucket map never exceeds maxKeys:
// on overflow it is cleared and reseeded.
func TestRateLimiterMaxKeysBound(t *testing.T) {
	rl := NewRateLimiter(1, 1, false)
	defer rl.Close()
	rl.maxKeys = 4
	for i := 0; i < 100; i++ {
		rl.limiterFor("ip:" + strconv.Itoa(i))
		if len(rl.buckets) > rl.maxKeys {
			t.Fatalf("bucket map grew past cap: %d > %d", len(rl.buckets), rl.maxKeys)
		}
	}
}

// --- recovery ------------------------------------------------------------

func TestRecoveryWrites500(t *testing.T) {
	var buf bytes.Buffer
	prev := slog.Default()
	slog.SetDefault(slog.New(slog.NewJSONHandler(&buf, nil)))
	defer slog.SetDefault(prev)

	h := Recovery(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		panic("boom")
	}))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/catalog", nil))
	if rec.Code != http.StatusInternalServerError {
		t.Errorf("status = %d, want 500", rec.Code)
	}
	if !strings.Contains(buf.String(), "panic recovered") {
		t.Errorf("panic not logged: %s", buf.String())
	}
}
