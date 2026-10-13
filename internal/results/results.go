// Package results is a read-only proxy for the Tekton Results v1alpha2 REST
// gateway. It exposes a small HTTP surface under /api/results that the run
// history UI consumes:
//
//	GET /api/results/runs?namespace=&kind=   list archived PipelineRuns/TaskRuns
//	GET /api/results/run?record=             the full archived run object
//	GET /api/results/logs?record=            archived log bytes (text/plain)
//	GET /api/results/config                  {enabled}
//
// Results does its own RBAC, so the logged-in user's OIDC token is forwarded
// verbatim as the bearer. The module is fail-closed: with no URL every data
// route is 503; with a URL but no user token (single-operator mode) it never
// falls back to ambient credentials and returns an empty result. Record names
// arrive as query params (not path segments) and are strictly validated.
package results

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"

	"github.com/aimemalaika/Kestrel/internal/auth"
)

const (
	apiPrefix    = "/apis/results.tekton.dev/v1alpha2"
	pageSize     = "100"
	maxPages     = 5
	maxBodyBytes = 32 << 20
)

// Config is the Results connection configuration (plumbed from flags).
type Config struct {
	URL string // gateway base incl. scheme; empty = not configured
}

// RunSummary is the list shape the UI consumes.
type RunSummary struct {
	UID            string `json:"uid"`
	Kind           string `json:"kind"`
	Namespace      string `json:"namespace"`
	Name           string `json:"name"`
	Status         string `json:"status"`
	StartTime      string `json:"startTime"`
	CompletionTime string `json:"completionTime"`
	RecordName     string `json:"recordName"`
}

// Handler serves the /api/results/* routes. An empty base means unconfigured.
type Handler struct {
	base string
	hc   *http.Client
}

// NewHandler builds the Results handler. With an empty cfg.URL every data route
// answers 503 and /config reports enabled=false. TLS verification is always on.
func NewHandler(cfg Config) *Handler {
	base := strings.TrimRight(strings.TrimSpace(cfg.URL), "/")
	if base == "" {
		return &Handler{}
	}
	return &Handler{
		base: base,
		hc:   &http.Client{Timeout: 30 * time.Second, CheckRedirect: refuseInternalRedirect},
	}
}

// refuseInternalRedirect caps the redirect chain and refuses any hop whose host
// resolves to a non-public IP, closing the SSRF-via-redirect vector (the user's
// bearer token must not follow a redirect to an internal address either).
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

// ---- HTTP routing ---------------------------------------------------------

func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	rest := strings.Trim(strings.TrimPrefix(r.URL.Path, "/api/results"), "/")
	switch rest {
	case "runs":
		h.only(w, r, http.MethodGet, h.runs)
	case "run":
		h.only(w, r, http.MethodGet, h.run)
	case "logs":
		h.only(w, r, http.MethodGet, h.logs)
	case "config":
		h.only(w, r, http.MethodGet, h.config)
	default:
		writeErr(w, errf(http.StatusNotFound, "NotFound", "unknown results path %s", r.URL.Path))
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

func (h *Handler) config(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"enabled": h.base != ""})
}

// gate returns false (after writing the response) when the request can't be
// proxied: 503 when unconfigured; otherwise, with no user token, the supplied
// empty body is written (fail-closed, never ambient credentials).
func (h *Handler) gate(w http.ResponseWriter, r *http.Request, empty func()) (string, bool) {
	if h.base == "" {
		writeErr(w, errf(http.StatusServiceUnavailable, "ServiceUnavailable",
			"results not configured (set --results-url to enable)"))
		return "", false
	}
	token := auth.From(r.Context()).Token
	if token == "" {
		empty()
		return "", false
	}
	return token, true
}

func (h *Handler) runs(w http.ResponseWriter, r *http.Request) {
	token, ok := h.gate(w, r, func() { writeJSON(w, http.StatusOK, map[string]any{"runs": []RunSummary{}}) })
	if !ok {
		return
	}
	q := r.URL.Query()
	ns, kind := q.Get("namespace"), q.Get("kind")
	parent := "-"
	if ns != "" {
		if !validName(ns) {
			writeErr(w, errf(http.StatusBadRequest, "BadRequest", "invalid namespace: %q", ns))
			return
		}
		parent = ns
	}
	if kind != "" && kind != "PipelineRun" && kind != "TaskRun" {
		writeErr(w, errf(http.StatusBadRequest, "BadRequest", "invalid kind: %q", kind))
		return
	}

	base := h.base + apiPrefix + "/parents/" + url.PathEscape(parent) + "/results/-/records"
	out := []RunSummary{}
	pageToken := ""
	for i := 0; i < maxPages; i++ {
		v := url.Values{"page_size": {pageSize}}
		if kind != "" {
			v.Set("filter", `data_type=="tekton.dev/v1.`+kind+`"`)
		}
		if pageToken != "" {
			v.Set("page_token", pageToken)
		}
		body, _, err := h.get(r.Context(), base+"?"+v.Encode(), token)
		if err != nil {
			writeErr(w, err)
			return
		}
		var lr struct {
			Records       []record `json:"records"`
			NextPageToken string   `json:"nextPageToken"`
		}
		if jerr := json.Unmarshal(body, &lr); jerr != nil {
			writeErr(w, errf(http.StatusBadGateway, "BadGateway", "results: invalid JSON: %v", jerr))
			return
		}
		for _, rec := range lr.Records {
			if s, ok := shape(rec, kind); ok {
				out = append(out, s)
			}
		}
		pageToken = lr.NextPageToken
		if pageToken == "" {
			break
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"runs": out})
}

func (h *Handler) run(w http.ResponseWriter, r *http.Request) {
	token, ok := h.gate(w, r, func() { writeJSON(w, http.StatusOK, map[string]any{}) })
	if !ok {
		return
	}
	name, ok := recordParam(w, r, "records")
	if !ok {
		return
	}
	body, _, err := h.get(r.Context(), h.base+apiPrefix+"/parents/"+name, token)
	if err != nil {
		writeErr(w, err)
		return
	}
	var rec record
	if jerr := json.Unmarshal(body, &rec); jerr != nil {
		writeErr(w, errf(http.StatusBadGateway, "BadGateway", "results: invalid JSON: %v", jerr))
		return
	}
	val, derr := rec.decode()
	if derr != nil {
		writeErr(w, errf(http.StatusBadGateway, "BadGateway", "results: %v", derr))
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(val)
}

func (h *Handler) logs(w http.ResponseWriter, r *http.Request) {
	token, ok := h.gate(w, r, func() {
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		w.WriteHeader(http.StatusOK)
	})
	if !ok {
		return
	}
	name, ok := recordParam(w, r, "logs")
	if !ok {
		return
	}
	body, _, err := h.get(r.Context(), h.base+apiPrefix+"/parents/"+name, token)
	if err != nil {
		writeErr(w, err)
		return
	}
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(body)
}

// ---- upstream -------------------------------------------------------------

// get issues one authenticated GET, forwarding the user's token as the bearer.
// Non-2xx maps to an *apiError (401/403/404 pass through; others become 502).
func (h *Handler) get(ctx context.Context, rawurl, token string) ([]byte, http.Header, *apiError) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawurl, nil)
	if err != nil {
		return nil, nil, errf(http.StatusBadGateway, "BadGateway", "results request: %v", err)
	}
	req.Header.Set("Authorization", "Bearer "+token)
	resp, err := h.hc.Do(req)
	if err != nil {
		return nil, nil, errf(http.StatusBadGateway, "BadGateway", "results request failed: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		snippet := ""
		if b, _ := io.ReadAll(io.LimitReader(resp.Body, 2048)); len(b) > 0 {
			snippet = ": " + strings.TrimSpace(string(b))
		}
		switch resp.StatusCode {
		case http.StatusNotFound:
			return nil, nil, errf(http.StatusNotFound, "NotFound", "results: not found%s", snippet)
		case http.StatusUnauthorized:
			return nil, nil, errf(http.StatusUnauthorized, "Unauthorized", "results: unauthorized%s", snippet)
		case http.StatusForbidden:
			return nil, nil, errf(http.StatusForbidden, "Forbidden", "results: forbidden%s", snippet)
		default:
			return nil, nil, errf(http.StatusBadGateway, "BadGateway", "results returned %d%s", resp.StatusCode, snippet)
		}
	}
	b, err := io.ReadAll(io.LimitReader(resp.Body, maxBodyBytes))
	if err != nil {
		return nil, nil, errf(http.StatusBadGateway, "BadGateway", "results: read body: %v", err)
	}
	return b, resp.Header, nil
}

// ---- record decode + shaping ---------------------------------------------

type record struct {
	Name string `json:"name"`
	UID  string `json:"uid"`
	Data struct {
		Type  string `json:"type"`
		Value string `json:"value"` // base64 of the object's JSON
	} `json:"data"`
}

func (rec record) decode() ([]byte, error) {
	b, err := base64.StdEncoding.DecodeString(rec.Data.Value)
	if err != nil {
		return nil, fmt.Errorf("record value is not base64: %w", err)
	}
	return b, nil
}

type runObject struct {
	Metadata struct {
		UID       string `json:"uid"`
		Name      string `json:"name"`
		Namespace string `json:"namespace"`
	} `json:"metadata"`
	Status struct {
		StartTime      string `json:"startTime"`
		CompletionTime string `json:"completionTime"`
		Conditions     []struct {
			Type   string `json:"type"`
			Status string `json:"status"`
			Reason string `json:"reason"`
		} `json:"conditions"`
	} `json:"status"`
}

// shape turns a record into a RunSummary; ok=false skips non-run records (e.g.
// log records) or ones that don't match the kind filter or won't decode.
func shape(rec record, wantKind string) (RunSummary, bool) {
	kind := ""
	switch {
	case strings.HasSuffix(rec.Data.Type, ".PipelineRun"):
		kind = "PipelineRun"
	case strings.HasSuffix(rec.Data.Type, ".TaskRun"):
		kind = "TaskRun"
	default:
		return RunSummary{}, false
	}
	if wantKind != "" && wantKind != kind {
		return RunSummary{}, false
	}
	raw, err := rec.decode()
	if err != nil {
		return RunSummary{}, false
	}
	var o runObject
	if json.Unmarshal(raw, &o) != nil {
		return RunSummary{}, false
	}
	uid := o.Metadata.UID
	if uid == "" {
		uid = rec.UID
	}
	return RunSummary{
		UID:            uid,
		Kind:           kind,
		Namespace:      o.Metadata.Namespace,
		Name:           o.Metadata.Name,
		Status:         runStatus(o),
		StartTime:      o.Status.StartTime,
		CompletionTime: o.Status.CompletionTime,
		RecordName:     rec.Name,
	}, true
}

// runStatus derives a display status from the Succeeded condition.
func runStatus(o runObject) string {
	for _, c := range o.Status.Conditions {
		if c.Type != "Succeeded" {
			continue
		}
		switch c.Status {
		case "True":
			return "Succeeded"
		case "False":
			if strings.Contains(strings.ToLower(c.Reason), "cancel") {
				return "Cancelled"
			}
			return "Failed"
		default:
			return "Running"
		}
	}
	return "Unknown"
}

// ---- validation -----------------------------------------------------------

var (
	segRe = regexp.MustCompile(`^[a-zA-Z0-9._-]+$`)
	nsRe  = regexp.MustCompile(`^[a-z0-9]([-a-z0-9.]*[a-z0-9])?$`)
)

// validName accepts a DNS-ish namespace name (length-bounded).
func validName(s string) bool { return len(s) <= 253 && nsRe.MatchString(s) }

// recordParam reads+validates ?record=, which must be a Results resource name of
// the form {parent}/results/{result}/{kind}/{id} (kind = records|logs). Each
// segment is restricted to a safe charset, so no traversal or query injection
// can reach the upstream path. Returns the escaped path remainder.
func recordParam(w http.ResponseWriter, r *http.Request, kind string) (string, bool) {
	rec := r.URL.Query().Get("record")
	if rec == "" {
		writeErr(w, errf(http.StatusBadRequest, "BadRequest", "missing required query param: record"))
		return "", false
	}
	parts := strings.Split(rec, "/")
	if len(parts) != 5 || parts[1] != "results" || parts[3] != kind {
		writeErr(w, errf(http.StatusBadRequest, "BadRequest", "invalid record name: %q", rec))
		return "", false
	}
	for i, p := range parts {
		if i == 1 || i == 3 {
			continue
		}
		if p == "." || p == ".." || !segRe.MatchString(p) {
			writeErr(w, errf(http.StatusBadRequest, "BadRequest", "invalid record name: %q", rec))
			return "", false
		}
	}
	for i := range parts {
		parts[i] = url.PathEscape(parts[i])
	}
	return strings.Join(parts, "/"), true
}

// ---- error / JSON rendering (contract error body {error,code,reason}) ------
//
// Rendered locally (not via httpapi) to avoid an import cycle, mirroring the
// registry and helm modules.

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
