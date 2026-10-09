package obs

import (
	"log/slog"
	"net"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/aimemalaika/Kestrel/internal/auth"
)

// SetupLogger installs a JSON slog logger as the process default at the given
// level ("debug"|"info"|"warn"|"error"; anything else => info) and returns it.
func SetupLogger(level string) *slog.Logger {
	lv := parseLevel(level)
	h := slog.NewJSONHandler(os.Stderr, &slog.HandlerOptions{Level: lv})
	l := slog.New(h)
	slog.SetDefault(l)
	return l
}

func parseLevel(s string) slog.Level {
	switch strings.ToLower(strings.TrimSpace(s)) {
	case "debug":
		return slog.LevelDebug
	case "warn", "warning":
		return slog.LevelWarn
	case "error":
		return slog.LevelError
	default:
		return slog.LevelInfo
	}
}

// RequestLogger logs one structured line per request: method, path group,
// status, duration, remote IP, and the authenticated user when present. It
// NEVER logs the bearer token, session id, or any request header (notably
// Authorization) — only the resolved user string from the context.
//
// For streaming endpoints the single line is emitted at connection CLOSE with
// the full connection duration, so there is no per-flush logging on SSE.
//
// trustProxy controls how the remote IP is resolved (see ClientIP): when false
// (the default) the X-Forwarded-For header is ignored and only RemoteAddr is
// used, so a client cannot forge the logged IP.
func RequestLogger(next http.Handler, trustProxy bool) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		group := classify(r.URL.Path)
		ww := wrapWriter(w)
		start := time.Now()

		next.ServeHTTP(ww, r)

		attrs := []any{
			slog.String("method", r.Method),
			slog.String("path_group", group),
			slog.Int("status", ww.Status()),
			slog.Duration("duration", time.Since(start)),
			slog.String("remote_ip", ClientIP(r, trustProxy)),
		}
		// auth.From is populated by the authn middleware (OIDC) or auth.Middleware
		// (single-operator) for /api; log the user only, never the token.
		if user := auth.From(r.Context()).User; user != "" {
			attrs = append(attrs, slog.String("user", user))
		}
		slog.LogAttrs(r.Context(), slog.LevelInfo, "http request", toLogAttrs(attrs)...)
	})
}

// toLogAttrs converts the []any of slog.Attr values to []slog.Attr for
// LogAttrs (which is allocation-light and avoids the key/value any-parsing).
func toLogAttrs(in []any) []slog.Attr {
	out := make([]slog.Attr, 0, len(in))
	for _, a := range in {
		if at, ok := a.(slog.Attr); ok {
			out = append(out, at)
		}
	}
	return out
}

// ClientIP extracts the caller's IP.
//
// X-Forwarded-For / X-Real-Ip are client-settable, so they are honored ONLY
// when trustProxy is true — i.e. when Kestrel sits behind a reverse proxy that
// is known to rewrite those headers. When trustProxy is false (the safe
// default), the headers are ignored entirely and the host part of RemoteAddr
// is used, so a client cannot forge its apparent IP to bypass per-IP rate
// limiting or spoof the logged source.
//
// With trustProxy true: first hop of X-Forwarded-For (trimmed), else
// X-Real-Ip, else RemoteAddr host.
func ClientIP(r *http.Request, trustProxy bool) string {
	if trustProxy {
		if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
			if i := strings.IndexByte(xff, ','); i >= 0 {
				return strings.TrimSpace(xff[:i])
			}
			return strings.TrimSpace(xff)
		}
		if xrip := strings.TrimSpace(r.Header.Get("X-Real-Ip")); xrip != "" {
			return xrip
		}
	}
	if host, _, err := net.SplitHostPort(r.RemoteAddr); err == nil {
		return host
	}
	return r.RemoteAddr
}
