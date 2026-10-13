// Package observe is a read-only proxy for the cluster's Prometheus HTTP API.
// It exposes a small surface under /api/observe:
//
//	GET /api/observe/query?query=&time=              -> /api/v1/query
//	GET /api/observe/query_range?query=&start=&end=&step= -> /api/v1/query_range
//	GET /api/observe/alerts                           -> /api/v1/alerts
//	GET /api/observe/rules                            -> /api/v1/rules
//	GET /api/observe/targets                          -> /api/v1/targets
//	GET /api/observe/config                           {prometheus,alertmanager,loki,grafanaUrl}
//
// The logged-in user's OIDC token is forwarded verbatim as the bearer. The
// module is fail-closed: with no Prometheus URL every data route is 503, and
// with a URL but no user token (single-operator mode) it answers 503 rather than
// ever using ambient credentials. Only a fixed whitelist of query params is ever
// forwarded upstream.
package observe

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/aimemalaika/Kestrel/internal/auth"
)

const maxBodyBytes = 32 << 20

// Config is the observability datasource configuration (plumbed from flags).
type Config struct {
	PrometheusURL   string // proxied; empty = data routes 503
	AlertmanagerURL string // configured + surfaced via /config (proxying is downstream)
	LokiURL         string // configured + surfaced via /config (proxying is downstream)
	GrafanaURL      string // UI link only
}

// Handler serves the /api/observe/* routes. An empty base means unconfigured.
type Handler struct {
	base         string
	alertmanager string
	loki         string
	grafana      string
	hc           *http.Client
}

// NewHandler builds the observe handler. TLS verification is always on.
func NewHandler(cfg Config) *Handler {
	trim := func(s string) string { return strings.TrimRight(strings.TrimSpace(s), "/") }
	h := &Handler{
		base:         trim(cfg.PrometheusURL),
		alertmanager: trim(cfg.AlertmanagerURL),
		loki:         trim(cfg.LokiURL),
		grafana:      trim(cfg.GrafanaURL),
	}
	if h.base != "" {
		h.hc = &http.Client{Timeout: 30 * time.Second, CheckRedirect: refuseInternalRedirect}
	}
	return h
}

// refuseInternalRedirect caps the redirect chain and refuses any hop whose host
// resolves to a non-public IP, so the user's bearer token cannot be bounced to
// an internal address (SSRF-via-redirect).
func refuseInternalRedirect(req *http.Request, via []*http.Request) error {
	if len(via) >= 5 {
		return errors.New("stopped after 5 redirects")
	}
	host := req.URL.Hostname()
	ips, err := net.LookupIP(host)
	if err != nil {
		return fmt.Errorf("refusing redirect: cannot resolve %q: %w", host, err)
	}
	for _, ip := range ips {
		if ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() || ip.IsUnspecified() {
			return fmt.Errorf("refusing redirect to non-public host %q (%s)", host, ip)
		}
	}
	return nil
}

// allowedParams is the only set of query params ever forwarded upstream.
var allowedParams = []string{"query", "time", "start", "end", "step"}

// ---- HTTP routing ---------------------------------------------------------

func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	rest := strings.Trim(strings.TrimPrefix(r.URL.Path, "/api/observe"), "/")
	switch rest {
	case "query", "query_range", "alerts", "rules", "targets":
		h.only(w, r, http.MethodGet, func(w http.ResponseWriter, r *http.Request) { h.proxy(w, r, rest) })
	case "config":
		h.only(w, r, http.MethodGet, h.config)
	default:
		writeErr(w, errf(http.StatusNotFound, "NotFound", "unknown observe path %s", r.URL.Path))
	}
}

func (h *Handler) only(w http.ResponseWriter, r *http.Request, method string, fn http.HandlerFunc) {
	if r.Method != method {
		w.Header().Set("Allow", method)
		writeErr(w, errf(http.StatusMethodNotAllowed, "MethodNotAllowed", "%s not allowed on %s", r.Method, r.URL.Path))
		return
	}
	fn(w, r)
}

// config needs no token: it only reports which datasources are enabled.
func (h *Handler) config(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"prometheus":   h.base != "",
		"alertmanager": h.alertmanager != "",
		"loki":         h.loki != "",
		"grafanaUrl":   h.grafana,
	})
}

// proxy forwards one whitelisted Prometheus API call. Fail-closed: 503 when
// unconfigured, and 503 when there is no user token (never ambient creds).
func (h *Handler) proxy(w http.ResponseWriter, r *http.Request, endpoint string) {
	if h.base == "" {
		writeErr(w, errf(http.StatusServiceUnavailable, "ServiceUnavailable",
			"observability not configured (set --prometheus-url to enable)"))
		return
	}
	token := auth.From(r.Context()).Token
	if token == "" {
		writeErr(w, errf(http.StatusServiceUnavailable, "ServiceUnavailable",
			"observability requires a signed-in user token"))
		return
	}
	in := r.URL.Query()
	if (endpoint == "query" || endpoint == "query_range") && strings.TrimSpace(in.Get("query")) == "" {
		writeErr(w, errf(http.StatusBadRequest, "BadRequest", "missing required query param: query"))
		return
	}
	if endpoint == "query_range" {
		for _, p := range []string{"start", "end", "step"} {
			if in.Get(p) == "" {
				writeErr(w, errf(http.StatusBadRequest, "BadRequest", "missing required query param: %s", p))
				return
			}
		}
	}
	out := url.Values{}
	for _, p := range allowedParams {
		if v := in.Get(p); v != "" {
			out.Set(p, v)
		}
	}
	target := h.base + "/api/v1/" + endpoint
	if len(out) > 0 {
		target += "?" + out.Encode()
	}
	body, aerr := h.get(r.Context(), target, token)
	if aerr != nil {
		writeErr(w, aerr)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(body)
}

// ---- upstream -------------------------------------------------------------

// get issues one authenticated GET, forwarding the user's token as the bearer.
// Non-2xx maps to an *apiError (401/403/404 pass through; others become 502).
func (h *Handler) get(ctx context.Context, rawurl, token string) ([]byte, *apiError) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawurl, nil)
	if err != nil {
		return nil, errf(http.StatusBadGateway, "BadGateway", "observe request: %v", err)
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Accept", "application/json")
	resp, err := h.hc.Do(req)
	if err != nil {
		return nil, errf(http.StatusBadGateway, "BadGateway", "observe request failed: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		snippet := ""
		if b, _ := io.ReadAll(io.LimitReader(resp.Body, 2048)); len(b) > 0 {
			snippet = ": " + strings.TrimSpace(string(b))
		}
		switch resp.StatusCode {
		case http.StatusNotFound:
			return nil, errf(http.StatusNotFound, "NotFound", "observe: not found%s", snippet)
		case http.StatusUnauthorized:
			return nil, errf(http.StatusUnauthorized, "Unauthorized", "observe: unauthorized%s", snippet)
		case http.StatusForbidden:
			return nil, errf(http.StatusForbidden, "Forbidden", "observe: forbidden%s", snippet)
		default:
			return nil, errf(http.StatusBadGateway, "BadGateway", "observe upstream returned %d%s", resp.StatusCode, snippet)
		}
	}
	b, err := io.ReadAll(io.LimitReader(resp.Body, maxBodyBytes))
	if err != nil {
		return nil, errf(http.StatusBadGateway, "BadGateway", "observe: read body: %v", err)
	}
	return b, nil
}

// ---- error / JSON rendering (contract error body {error,code,reason}) ------

type apiError struct {
	code   int
	reason string
	msg    string
}

func (e *apiError) Error() string { return e.msg }

func errf(code int, reason, format string, a ...any) *apiError {
	return &apiError{code: code, reason: reason, msg: fmt.Sprintf(format, a...)}
}

func writeErr(w http.ResponseWriter, err error) {
	if ae, ok := err.(*apiError); ok {
		writeJSON(w, ae.code, map[string]any{"error": ae.msg, "code": ae.code, "reason": ae.reason})
		return
	}
	writeJSON(w, http.StatusInternalServerError,
		map[string]any{"error": err.Error(), "code": 500, "reason": "InternalError"})
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}
