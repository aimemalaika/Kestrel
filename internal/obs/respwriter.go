// Package obs is the observability + protection layer: Prometheus metrics,
// structured-logging middleware, a token-bucket rate limiter, and a panic
// recovery wrapper. All of it is additive HTTP middleware composed in main
// around the existing mux; none of it changes API behavior.
//
// The one hazard this package is built around is wrapping http.ResponseWriter.
// Kestrel serves SSE (/api/stream, /api/logs) and WebSocket (/api/exec,
// /api/port-forward), so any writer wrapper MUST keep the underlying
// http.Flusher (SSE flushing via stream.Begin) and http.Hijacker (the gorilla
// WS upgrade) reachable, or those endpoints silently break. See responseWriter.
package obs

import (
	"bufio"
	"fmt"
	"net"
	"net/http"
)

// responseWriter wraps an http.ResponseWriter to capture the status code (for
// metrics and request logging) while PRESERVING the optional interfaces that
// streaming depends on.
//
// It embeds the inner ResponseWriter and explicitly forwards Flush() and
// Hijack() to it when the inner value implements http.Flusher / http.Hijacker.
// Because the real net/http HTTP/1 writer implements both, SSE flushing and the
// WebSocket hijack keep working through the full middleware chain. Flush on a
// non-flushing inner is a no-op; Hijack on a non-hijacking inner returns an
// error rather than panicking.
//
// Unwrap exposes the inner writer so net/http's ResponseController (and anyone
// walking the chain) can still reach capabilities not mirrored here.
type responseWriter struct {
	http.ResponseWriter
	status      int
	wroteHeader bool
}

// wrapWriter returns a *responseWriter around w. Nil inner is returned as-is to
// keep callers simple in tests.
func wrapWriter(w http.ResponseWriter) *responseWriter {
	if rw, ok := w.(*responseWriter); ok {
		return rw // never double-wrap
	}
	return &responseWriter{ResponseWriter: w}
}

func (w *responseWriter) WriteHeader(code int) {
	if !w.wroteHeader {
		w.status = code
		w.wroteHeader = true
	}
	w.ResponseWriter.WriteHeader(code)
}

func (w *responseWriter) Write(b []byte) (int, error) {
	if !w.wroteHeader {
		// An implicit 200, mirroring net/http semantics.
		w.status = http.StatusOK
		w.wroteHeader = true
	}
	return w.ResponseWriter.Write(b)
}

// Status returns the captured status code, defaulting to 200 when the handler
// wrote a body without an explicit WriteHeader and 0 was never set.
func (w *responseWriter) Status() int {
	if w.status == 0 {
		return http.StatusOK
	}
	return w.status
}

// Flush forwards to the inner writer's Flush when it is an http.Flusher. This is
// what keeps SSE working: stream.Begin type-asserts the writer to http.Flusher,
// and the wrapper satisfies it by delegating here.
func (w *responseWriter) Flush() {
	if f, ok := w.ResponseWriter.(http.Flusher); ok {
		f.Flush()
	}
}

// Hijack forwards to the inner writer's Hijack when it is an http.Hijacker. This
// is what keeps the WebSocket upgrade working: gorilla requires the writer to be
// an http.Hijacker. On hijack the response bytes are taken over by the caller,
// so record a 101 for metrics/logging since WriteHeader will never be called.
func (w *responseWriter) Hijack() (net.Conn, *bufio.ReadWriter, error) {
	h, ok := w.ResponseWriter.(http.Hijacker)
	if !ok {
		return nil, nil, fmt.Errorf("obs: underlying ResponseWriter does not implement http.Hijacker")
	}
	if !w.wroteHeader {
		w.status = http.StatusSwitchingProtocols
		w.wroteHeader = true
	}
	return h.Hijack()
}

// Unwrap lets net/http's ResponseController and chain walkers reach the inner
// writer directly.
func (w *responseWriter) Unwrap() http.ResponseWriter { return w.ResponseWriter }
