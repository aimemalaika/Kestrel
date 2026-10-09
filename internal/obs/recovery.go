package obs

import (
	"log/slog"
	"net/http"
	"runtime/debug"
)

// Recovery is the outermost middleware: it recovers panics from downstream
// handlers, logs them via slog.Error (with method, path group, the recovered
// value, and the stack), and attempts a 500 response.
//
// On a hijacked or already-streaming connection a status can no longer be
// written, so the attempt is itself guarded: net/http returns ErrHijacked (not
// a panic) from WriteHeader after a hijack, and a second recover here swallows
// anything unexpected. The panic is always logged regardless.
func Recovery(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			rec := recover()
			if rec == nil {
				return
			}
			// http.ErrAbortHandler is the sentinel handlers panic with to abort
			// quietly; propagate it so net/http handles it as intended.
			if rec == http.ErrAbortHandler {
				panic(rec)
			}
			slog.Error("panic recovered",
				slog.String("method", r.Method),
				slog.String("path_group", classify(r.URL.Path)),
				slog.Any("panic", rec),
				slog.String("stack", string(debug.Stack())),
			)
			// Best-effort 500. On a hijacked/streaming conn this is a no-op or an
			// ErrHijacked, never a panic — but guard it anyway so recovery itself
			// can never take down the server.
			func() {
				defer func() { _ = recover() }()
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusInternalServerError)
				_, _ = w.Write([]byte(`{"error":"internal server error","code":500,"reason":"InternalError"}`))
			}()
		}()
		next.ServeHTTP(w, r)
	})
}
