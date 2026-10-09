package obs

import (
	"net/http"
	"strconv"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

// Metrics owns Kestrel's Prometheus collectors and the HTTP middleware that
// feeds them. Collectors are registered on a dedicated *prometheus.Registry
// (not the global default) so tests get a clean, isolated registry and there is
// no accidental collision with any library's default-registry collectors.
type Metrics struct {
	reg *prometheus.Registry

	requests      *prometheus.CounterVec   // kestrel_http_requests_total{method,path_group,code}
	duration      *prometheus.HistogramVec // kestrel_http_request_duration_seconds{method,path_group}
	inFlight      prometheus.Gauge         // kestrel_http_in_flight
	activeStreams prometheus.Gauge         // kestrel_active_streams
	logins        *prometheus.CounterVec   // kestrel_auth_logins_total{result}
	sessions      prometheus.Gauge         // kestrel_auth_sessions
}

// NewMetrics builds and registers the collectors on a fresh registry.
func NewMetrics() *Metrics {
	reg := prometheus.NewRegistry()
	m := &Metrics{
		reg: reg,
		requests: prometheus.NewCounterVec(prometheus.CounterOpts{
			Name: "kestrel_http_requests_total",
			Help: "Total HTTP requests by method, path group, and status code.",
		}, []string{"method", "path_group", "code"}),
		duration: prometheus.NewHistogramVec(prometheus.HistogramOpts{
			Name:    "kestrel_http_request_duration_seconds",
			Help:    "HTTP request latency for non-streaming requests, by method and path group.",
			Buckets: prometheus.DefBuckets,
		}, []string{"method", "path_group"}),
		inFlight: prometheus.NewGauge(prometheus.GaugeOpts{
			Name: "kestrel_http_in_flight",
			Help: "HTTP requests currently being served.",
		}),
		activeStreams: prometheus.NewGauge(prometheus.GaugeOpts{
			Name: "kestrel_active_streams",
			Help: "Active long-lived streaming/upgrade connections (SSE, logs, exec, port-forward).",
		}),
		logins: prometheus.NewCounterVec(prometheus.CounterOpts{
			Name: "kestrel_auth_logins_total",
			Help: "OIDC login attempts by result (success|failure).",
		}, []string{"result"}),
		sessions: prometheus.NewGauge(prometheus.GaugeOpts{
			Name: "kestrel_auth_sessions",
			Help: "Active authenticated sessions.",
		}),
	}
	reg.MustRegister(m.requests, m.duration, m.inFlight, m.activeStreams, m.logins, m.sessions)
	// Keep the standard process/go collectors too — cheap and useful for ops.
	reg.MustRegister(
		prometheus.NewProcessCollector(prometheus.ProcessCollectorOpts{}),
		prometheus.NewGoCollector(),
	)
	return m
}

// Handler serves the registry in the Prometheus text/OpenMetrics exposition
// format. It is mounted on a SEPARATE listener in main (not the authn'd mux),
// because a scraper has no session.
func (m *Metrics) Handler() http.Handler {
	return promhttp.HandlerFor(m.reg, promhttp.HandlerOpts{Registry: m.reg})
}

// Middleware classifies the request path to a low-cardinality group, tracks
// in-flight requests, records status codes, and times non-streaming requests.
// Streaming endpoints are counted in the active-streams gauge and excluded from
// the latency histogram. The response writer is wrapped with the
// Flusher/Hijacker-preserving wrapper so SSE and WS still work downstream.
func (m *Metrics) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		group := classify(r.URL.Path)
		ww := wrapWriter(w)

		m.inFlight.Inc()
		defer m.inFlight.Dec()

		// NOTE: Recovery is the OUTERMOST middleware (see main's chain), so a
		// handler that panics unwinds past this middleware before the counter
		// line below runs — panicked requests are therefore NOT counted in
		// kestrel_http_requests_total (nor timed in the histogram). Do not reorder.
		method := classifyMethod(r.Method)

		if isStreamGroup(group) {
			m.activeStreams.Inc()
			defer m.activeStreams.Dec()
			next.ServeHTTP(ww, r)
			m.requests.WithLabelValues(method, group, strconv.Itoa(ww.Status())).Inc()
			return
		}

		start := time.Now()
		next.ServeHTTP(ww, r)
		m.duration.WithLabelValues(method, group).Observe(time.Since(start).Seconds())
		m.requests.WithLabelValues(method, group, strconv.Itoa(ww.Status())).Inc()
	})
}

// classifyMethod bounds the cardinality of the "method" metric label. r.Method
// is attacker-controlled (net/http accepts any RFC7230 token), so feeding it
// raw into a Prometheus label would let a client mint unbounded label series
// and exhaust memory. We allow only the fixed set of canonical HTTP methods
// (compared case-sensitively against the upper-case forms net/http uses) and
// collapse everything else — garbage, lowercase, unknown verbs — to "other".
func classifyMethod(m string) string {
	switch m {
	case http.MethodGet, http.MethodPost, http.MethodPut, http.MethodPatch,
		http.MethodDelete, http.MethodHead, http.MethodOptions:
		return m
	default:
		return "other"
	}
}

// --- auth hooks (nice-to-have; not yet wired) ---------------------------
//
// These let the authn layer report login results and the live session count
// via a small injected interface, without this package importing authn. They
// are intentionally not wired into internal/authn yet to avoid entangling the
// auth flow; the collectors simply read zero until a future change injects a
// Metrics value and calls them. TODO(B9): hook RecordLogin at Callback and
// Inc/DecSessions in the session store.

// RecordLogin bumps kestrel_auth_logins_total for the given result.
func (m *Metrics) RecordLogin(result string) { m.logins.WithLabelValues(result).Inc() }

// IncSessions / DecSessions track the live authenticated-session gauge.
func (m *Metrics) IncSessions() { m.sessions.Inc() }
func (m *Metrics) DecSessions() { m.sessions.Dec() }
