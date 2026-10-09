// Package registry is an OCI Distribution v2 proxy/browser. It exposes a small
// HTTP surface under /api/registry that the registry module UI consumes:
// list repositories, list tags, fetch image detail (digest/size/layers), and
// delete by digest. The target registry's address/scheme comes from config
// (never a localhost assumption); when unconfigured every route returns 503,
// mirroring the OIDC-disabled hedge.
//
// Repo names contain slashes, so routes take the repo as a query parameter
// rather than a path segment (e.g. GET /api/registry/tags?repo=library/ubuntu).
package registry

import (
	"context"
	"crypto/sha256"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"

	"golang.org/x/net/publicsuffix"
)

// Manifest media types we accept/parse. The Accept header advertises all of
// them so a registry returns whichever it stores natively.
const (
	mtOCIManifest    = "application/vnd.oci.image.manifest.v1+json"
	mtOCIIndex       = "application/vnd.oci.image.index.v1+json"
	mtDockerManifest = "application/vnd.docker.distribution.manifest.v2+json"
	mtDockerList     = "application/vnd.docker.distribution.manifest.list.v2+json"
)

// manifestAccept is the Accept header value sent on manifest GETs.
var manifestAccept = strings.Join([]string{
	mtOCIManifest, mtDockerManifest, mtOCIIndex, mtDockerList,
}, ", ")

// Config is the registry connection configuration (plumbed from flags).
type Config struct {
	URL                string // full base incl. scheme, e.g. https://registry.example.com; empty = not configured
	Username           string // optional basic-auth username
	Password           string // optional basic-auth password
	InsecureSkipVerify bool   // skip TLS verification of the registry
	AllowDelete        bool   // enable DELETE by digest (deletesEnabled)
}

// apiError carries an HTTP status for the handler to render as the contract
// error body {error,code,reason}.
type apiError struct {
	code   int
	reason string
	msg    string
}

func (e *apiError) Error() string { return e.msg }

func errf(code int, reason, format string, a ...any) *apiError {
	return &apiError{code: code, reason: reason, msg: fmt.Sprintf(format, a...)}
}

// errs builds an apiError from a pre-composed (non-format) message.
func errs(code int, reason, msg string) *apiError {
	return &apiError{code: code, reason: reason, msg: msg}
}

// Client is an OCI Distribution v2 client against Config.URL/v2/.
type Client struct {
	cfg  Config
	base string // trimmed URL (no trailing slash)
	host string // registry host (cfg.URL's hostname), used to gate credential forwarding
	hc   *http.Client
}

// Handler serves the /api/registry/* routes backed by a Client. When the
// registry is not configured (empty URL), c is nil and every route returns 503.
type Handler struct {
	c           *Client
	allowDelete bool
}

// NewHandler builds the registry HTTP handler. With an empty cfg.URL it returns
// a handler that answers 503 "registry not configured" on every path.
func NewHandler(cfg Config) *Handler {
	if strings.TrimSpace(cfg.URL) == "" {
		return &Handler{c: nil, allowDelete: false}
	}
	tr := http.DefaultTransport.(*http.Transport).Clone()
	if cfg.InsecureSkipVerify {
		tr.TLSClientConfig = &tls.Config{InsecureSkipVerify: true} //nolint:gosec // opt-in via --registry-insecure-skip-verify
	}
	base := strings.TrimRight(cfg.URL, "/")
	host := ""
	if pu, err := url.Parse(base); err == nil {
		host = pu.Hostname()
	}
	return &Handler{
		c: &Client{
			cfg:  cfg,
			base: base,
			host: host,
			hc:   &http.Client{Timeout: 30 * time.Second, Transport: tr},
		},
		allowDelete: cfg.AllowDelete,
	}
}

// ---- HTTP routing ---------------------------------------------------------

func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if h.c == nil {
		writeErr(w, errs(http.StatusServiceUnavailable, "ServiceUnavailable",
			"registry not configured (set --registry-url to enable)"))
		return
	}
	rest := strings.TrimPrefix(r.URL.Path, "/api/registry")
	rest = strings.Trim(rest, "/")
	switch rest {
	case "repos":
		h.only(w, r, http.MethodGet, h.repos)
	case "tags":
		h.only(w, r, http.MethodGet, h.tags)
	case "config":
		h.only(w, r, http.MethodGet, h.config)
	case "image":
		switch r.Method {
		case http.MethodGet:
			h.image(w, r)
		case http.MethodDelete:
			h.deleteImage(w, r)
		default:
			w.Header().Set("Allow", "GET, DELETE")
			writeErr(w, errs(http.StatusMethodNotAllowed, "MethodNotAllowed",
				r.Method+" not allowed on "+r.URL.Path))
		}
	default:
		writeErr(w, errs(http.StatusNotFound, "NotFound", "unknown registry path "+r.URL.Path))
	}
}

func (h *Handler) only(w http.ResponseWriter, r *http.Request, method string, fn http.HandlerFunc) {
	if r.Method != method {
		w.Header().Set("Allow", method)
		writeErr(w, errs(http.StatusMethodNotAllowed, "MethodNotAllowed", r.Method+" not allowed on "+r.URL.Path))
		return
	}
	fn(w, r)
}

func (h *Handler) repos(w http.ResponseWriter, r *http.Request) {
	repos, err := h.c.listRepos(r.Context())
	if err != nil {
		writeErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"repos": repos})
}

func (h *Handler) tags(w http.ResponseWriter, r *http.Request) {
	repo := r.URL.Query().Get("repo")
	if repo == "" {
		writeErr(w, errf(http.StatusBadRequest, "BadRequest", "missing required query param: repo"))
		return
	}
	if !validRepo(repo) {
		writeErr(w, errf(http.StatusBadRequest, "BadRequest", "invalid repo name: %q", repo))
		return
	}
	tags, err := h.c.listTags(r.Context(), repo)
	if err != nil {
		writeErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"tags": tags})
}

func (h *Handler) image(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	repo, tag := q.Get("repo"), q.Get("tag")
	if repo == "" || tag == "" {
		writeErr(w, errf(http.StatusBadRequest, "BadRequest", "missing required query params: repo and tag"))
		return
	}
	if !validRepo(repo) {
		writeErr(w, errf(http.StatusBadRequest, "BadRequest", "invalid repo name: %q", repo))
		return
	}
	if !validRef(tag) {
		writeErr(w, errf(http.StatusBadRequest, "BadRequest", "invalid tag: %q", tag))
		return
	}
	img, err := h.c.getImage(r.Context(), repo, tag)
	if err != nil {
		writeErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, img)
}

func (h *Handler) deleteImage(w http.ResponseWriter, r *http.Request) {
	if !h.allowDelete {
		w.Header().Set("Allow", "GET")
		writeErr(w, errf(http.StatusMethodNotAllowed, "MethodNotAllowed",
			"registry deletes are disabled (set --registry-allow-delete to enable)"))
		return
	}
	q := r.URL.Query()
	repo, digest := q.Get("repo"), q.Get("digest")
	if repo == "" || digest == "" {
		writeErr(w, errf(http.StatusBadRequest, "BadRequest", "missing required query params: repo and digest"))
		return
	}
	if !validRepo(repo) {
		writeErr(w, errf(http.StatusBadRequest, "BadRequest", "invalid repo name: %q", repo))
		return
	}
	if !validDigest(digest) {
		writeErr(w, errf(http.StatusBadRequest, "BadRequest", "invalid digest: %q", digest))
		return
	}
	if err := h.c.deleteByDigest(r.Context(), repo, digest); err != nil {
		writeErr(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) config(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"deletesEnabled": h.allowDelete})
}

// ---- OCI v2 client --------------------------------------------------------

// Image is the detail returned by getImage, matching the UI's ImageInfo shape.
type Image struct {
	Digest string `json:"digest"`
	Size   int64  `json:"size"`
	Layers int    `json:"layers"`
}

type catalogResp struct {
	Repositories []string `json:"repositories"`
}

type tagsResp struct {
	Tags []string `json:"tags"`
}

type descriptor struct {
	MediaType string    `json:"mediaType"`
	Digest    string    `json:"digest"`
	Size      int64     `json:"size"`
	Platform  *platform `json:"platform,omitempty"`
}

type platform struct {
	OS           string `json:"os"`
	Architecture string `json:"architecture"`
}

type manifest struct {
	MediaType string       `json:"mediaType"`
	Config    descriptor   `json:"config"`
	Layers    []descriptor `json:"layers"`
	Manifests []descriptor `json:"manifests"` // present for index/list
}

func (c *Client) listRepos(ctx context.Context) ([]string, error) {
	var out []string
	next := c.base + "/v2/_catalog"
	// Best-effort pagination via the Link header; bounded to avoid a loop.
	for i := 0; i < 50 && next != ""; i++ {
		resp, err := c.do(ctx, http.MethodGet, next, "")
		if err != nil {
			return nil, err
		}
		body, err := readAll(resp)
		if err != nil {
			return nil, err
		}
		var cr catalogResp
		if err := json.Unmarshal(body, &cr); err != nil {
			return nil, errf(http.StatusBadGateway, "BadGateway", "registry catalog: invalid JSON: %v", err)
		}
		out = append(out, cr.Repositories...)
		next = nextLink(c.base, resp.Header.Get("Link"))
	}
	if out == nil {
		out = []string{}
	}
	return out, nil
}

func (c *Client) listTags(ctx context.Context, repo string) ([]string, error) {
	u := c.base + "/v2/" + pathEscapeRepo(repo) + "/tags/list"
	resp, err := c.do(ctx, http.MethodGet, u, "")
	if err != nil {
		return nil, err
	}
	body, err := readAll(resp)
	if err != nil {
		return nil, err
	}
	var tr tagsResp
	if err := json.Unmarshal(body, &tr); err != nil {
		return nil, errf(http.StatusBadGateway, "BadGateway", "registry tags: invalid JSON: %v", err)
	}
	if tr.Tags == nil {
		tr.Tags = []string{}
	}
	return tr.Tags, nil
}

func (c *Client) getImage(ctx context.Context, repo, ref string) (Image, error) {
	resp, err := c.do(ctx, http.MethodGet, c.manifestURL(repo, ref), manifestAccept)
	if err != nil {
		return Image{}, err
	}
	body, err := readAll(resp)
	if err != nil {
		return Image{}, err
	}
	// The digest of the requested ref (what we report), from the header or a
	// computed sha256 of the body as a fallback.
	digest := resp.Header.Get("Docker-Content-Digest")
	if digest == "" {
		digest = computeDigest(body)
	}
	var m manifest
	if err := json.Unmarshal(body, &m); err != nil {
		return Image{}, errf(http.StatusBadGateway, "BadGateway", "registry manifest: invalid JSON: %v", err)
	}

	// Index/list: resolve to a child manifest for size/layers, but keep the
	// requested ref's digest as the reported digest.
	if isIndex(m.MediaType, resp.Header.Get("Content-Type"), m.Manifests) {
		child := pickManifest(m.Manifests)
		if child == nil {
			return Image{}, errf(http.StatusBadGateway, "BadGateway", "registry manifest index: no child manifests")
		}
		cResp, err := c.do(ctx, http.MethodGet, c.manifestURL(repo, child.Digest), manifestAccept)
		if err != nil {
			return Image{}, err
		}
		cBody, err := readAll(cResp)
		if err != nil {
			return Image{}, err
		}
		var cm manifest
		if err := json.Unmarshal(cBody, &cm); err != nil {
			return Image{}, errf(http.StatusBadGateway, "BadGateway", "registry child manifest: invalid JSON: %v", err)
		}
		// A child that is itself an index would unmarshal with empty Layers and a
		// zero Size, silently reporting Layers:0/Size:0. Reject it clearly rather
		// than resolving recursively.
		if isIndex(cm.MediaType, cResp.Header.Get("Content-Type"), cm.Manifests) {
			return Image{}, errf(http.StatusBadGateway, "BadGateway", "registry manifest index: nested image index not supported")
		}
		return Image{Digest: digest, Size: manifestSize(cm), Layers: len(cm.Layers)}, nil
	}

	return Image{Digest: digest, Size: manifestSize(m), Layers: len(m.Layers)}, nil
}

func (c *Client) deleteByDigest(ctx context.Context, repo, digest string) error {
	resp, err := c.do(ctx, http.MethodDelete, c.manifestURL(repo, digest), "")
	if err != nil {
		return err
	}
	_ = resp.Body.Close()
	return nil
}

func (c *Client) manifestURL(repo, ref string) string {
	return c.base + "/v2/" + pathEscapeRepo(repo) + "/manifests/" + url.PathEscape(ref)
}

// ---- auth + transport -----------------------------------------------------

// do issues an authenticated request. It sends basic auth when configured, and
// on a 401 Bearer challenge fetches a token from the realm and retries once.
// A non-2xx response is turned into an *apiError (and its body drained/closed).
func (c *Client) do(ctx context.Context, method, rawurl, accept string) (*http.Response, error) {
	resp, err := c.send(ctx, method, rawurl, accept, "")
	if err != nil {
		return nil, errf(http.StatusBadGateway, "BadGateway", "registry request failed: %v", err)
	}
	if resp.StatusCode == http.StatusUnauthorized {
		ch := parseChallenge(resp.Header.Get("WWW-Authenticate"))
		if ch != nil {
			_ = resp.Body.Close()
			token, terr := c.fetchToken(ctx, ch)
			if terr != nil {
				return nil, terr
			}
			resp, err = c.send(ctx, method, rawurl, accept, token)
			if err != nil {
				return nil, errf(http.StatusBadGateway, "BadGateway", "registry request (bearer) failed: %v", err)
			}
		}
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, c.statusError(resp)
	}
	return resp, nil
}

// send builds and sends one request. When bearer is non-empty it sets
// Authorization: Bearer; otherwise it falls back to basic auth if configured.
func (c *Client) send(ctx context.Context, method, rawurl, accept, bearer string) (*http.Response, error) {
	req, err := http.NewRequestWithContext(ctx, method, rawurl, nil)
	if err != nil {
		return nil, err
	}
	if accept != "" {
		req.Header.Set("Accept", accept)
	}
	switch {
	case bearer != "":
		req.Header.Set("Authorization", "Bearer "+bearer)
	case c.cfg.Username != "" || c.cfg.Password != "":
		req.SetBasicAuth(c.cfg.Username, c.cfg.Password)
	}
	return c.hc.Do(req)
}

// challenge is a parsed WWW-Authenticate: Bearer value.
type challenge struct {
	realm   string
	service string
	scope   string
}

// parseChallenge parses `Bearer realm="...",service="...",scope="..."`. It
// returns nil for a non-Bearer or empty header.
func parseChallenge(h string) *challenge {
	h = strings.TrimSpace(h)
	if !strings.HasPrefix(strings.ToLower(h), "bearer ") {
		return nil
	}
	params := map[string]string{}
	for _, part := range splitParams(h[len("bearer "):]) {
		kv := strings.SplitN(part, "=", 2)
		if len(kv) != 2 {
			continue
		}
		key := strings.TrimSpace(kv[0])
		val := strings.Trim(strings.TrimSpace(kv[1]), `"`)
		params[strings.ToLower(key)] = val
	}
	if params["realm"] == "" {
		return nil
	}
	return &challenge{realm: params["realm"], service: params["service"], scope: params["scope"]}
}

// splitParams splits a comma-separated parameter list, respecting quotes so a
// scope value containing commas is not broken apart.
func splitParams(s string) []string {
	var out []string
	var cur strings.Builder
	inQuote := false
	for _, r := range s {
		switch {
		case r == '"':
			inQuote = !inQuote
			cur.WriteRune(r)
		case r == ',' && !inQuote:
			out = append(out, cur.String())
			cur.Reset()
		default:
			cur.WriteRune(r)
		}
	}
	if cur.Len() > 0 {
		out = append(out, cur.String())
	}
	return out
}

type tokenResp struct {
	Token       string `json:"token"`
	AccessToken string `json:"access_token"`
}

// fetchToken performs the bearer-token handshake against the challenge realm.
// Basic auth is forwarded to the token endpoint only when the realm is HTTPS and
// same-site (same eTLD+1) as the configured registry; otherwise the token is
// requested anonymously so public images still resolve.
func (c *Client) fetchToken(ctx context.Context, ch *challenge) (string, error) {
	u, err := url.Parse(ch.realm)
	if err != nil {
		return "", errf(http.StatusBadGateway, "BadGateway", "registry auth: bad realm %q: %v", ch.realm, err)
	}
	// Require an https realm before making ANY token request (anonymous included).
	// A hostile/compromised registry can point the realm at an internal http://
	// host; fetching it would be a blind SSRF (and, in the credentialed case,
	// leak creds). Refuse rather than contact a non-https realm at all.
	if u.Scheme != "https" {
		return "", errf(http.StatusBadGateway, "BadGateway",
			"registry auth: refusing non-https token realm %q", ch.realm)
	}
	q := u.Query()
	if ch.service != "" {
		q.Set("service", ch.service)
	}
	if ch.scope != "" {
		q.Set("scope", ch.scope)
	}
	u.RawQuery = q.Encode()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
	if err != nil {
		return "", errf(http.StatusBadGateway, "BadGateway", "registry auth: %v", err)
	}
	// Only forward the operator's basic-auth credentials to the token realm when
	// the realm is both HTTPS and same-site (same eTLD+1) as the configured
	// registry. A malicious/MITM'd registry can name an arbitrary realm in its
	// WWW-Authenticate header; forwarding creds there would leak them. When the
	// realm fails the check we request the token anonymously so public images
	// still resolve.
	allowCreds := u.Scheme == "https" && sameSite(u.Hostname(), c.host)
	if allowCreds && (c.cfg.Username != "" || c.cfg.Password != "") {
		req.SetBasicAuth(c.cfg.Username, c.cfg.Password)
	}
	resp, err := c.hc.Do(req)
	if err != nil {
		return "", errf(http.StatusBadGateway, "BadGateway", "registry auth request failed: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", errf(http.StatusBadGateway, "BadGateway", "registry auth: token endpoint returned %d", resp.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return "", errf(http.StatusBadGateway, "BadGateway", "registry auth: read token: %v", err)
	}
	var tr tokenResp
	if err := json.Unmarshal(body, &tr); err != nil {
		return "", errf(http.StatusBadGateway, "BadGateway", "registry auth: invalid token JSON: %v", err)
	}
	if tr.Token != "" {
		return tr.Token, nil
	}
	if tr.AccessToken != "" {
		return tr.AccessToken, nil
	}
	return "", errf(http.StatusBadGateway, "BadGateway", "registry auth: token endpoint returned no token")
}

// statusError maps an upstream non-2xx response to an *apiError. 404 passes
// through as 404; 401/403 pass through; everything else becomes 502.
func (c *Client) statusError(resp *http.Response) *apiError {
	defer resp.Body.Close()
	snippet := ""
	if b, _ := io.ReadAll(io.LimitReader(resp.Body, 2048)); len(b) > 0 {
		snippet = ": " + strings.TrimSpace(string(b))
	}
	switch resp.StatusCode {
	case http.StatusNotFound:
		return errf(http.StatusNotFound, "NotFound", "registry: not found%s", snippet)
	case http.StatusUnauthorized:
		return errf(http.StatusUnauthorized, "Unauthorized", "registry: unauthorized%s", snippet)
	case http.StatusForbidden:
		return errf(http.StatusForbidden, "Forbidden", "registry: forbidden%s", snippet)
	default:
		return errf(http.StatusBadGateway, "BadGateway", "registry returned %d%s", resp.StatusCode, snippet)
	}
}

// ---- helpers --------------------------------------------------------------

func manifestSize(m manifest) int64 {
	total := m.Config.Size
	for _, l := range m.Layers {
		total += l.Size
	}
	return total
}

func isIndex(mediaType, contentType string, manifests []descriptor) bool {
	for _, mt := range []string{mediaType, contentType} {
		if strings.Contains(mt, "image.index") || strings.Contains(mt, "manifest.list") {
			return true
		}
	}
	// No explicit type but child manifests present ⇒ treat as an index.
	return len(manifests) > 0
}

// pickManifest chooses a child manifest from an index: linux/amd64 if present,
// else the first entry. Entries with no platform (e.g. attestation manifests)
// are skipped when a platformed entry exists.
func pickManifest(ms []descriptor) *descriptor {
	var firstPlatformed *descriptor
	for i := range ms {
		d := &ms[i]
		if d.Platform != nil && d.Platform.OS == "linux" && d.Platform.Architecture == "amd64" {
			return d
		}
		if firstPlatformed == nil && d.Platform != nil {
			firstPlatformed = d
		}
	}
	if firstPlatformed != nil {
		return firstPlatformed
	}
	if len(ms) > 0 {
		return &ms[0]
	}
	return nil
}

func computeDigest(body []byte) string {
	sum := sha256.Sum256(body)
	return fmt.Sprintf("sha256:%x", sum)
}

// repoSegmentRe permits a conservative per-segment character set. OCI names are
// lowercase, but we stay lenient on case; the point is to forbid path-escaping
// metacharacters and anything but these bytes.
var repoSegmentRe = regexp.MustCompile(`^[a-zA-Z0-9._-]+$`)

// digestRe matches an algorithm:hex digest (e.g. sha256:<hex>).
var digestRe = regexp.MustCompile(`^[a-z0-9]+:[a-f0-9]+$`)

// validRepo rejects empty names and any segment that is empty, ".", "..", or
// contains a character outside repoSegmentRe. This blocks same-host path
// traversal (e.g. "../../foo") that would otherwise survive url.PathEscape.
func validRepo(repo string) bool {
	if repo == "" {
		return false
	}
	for _, seg := range strings.Split(repo, "/") {
		if seg == "" || seg == "." || seg == ".." || !repoSegmentRe.MatchString(seg) {
			return false
		}
	}
	return true
}

// validRef rejects empty tags/refs and any containing a slash or control char.
func validRef(ref string) bool {
	if ref == "" {
		return false
	}
	for _, r := range ref {
		if r == '/' || r < 0x20 || r == 0x7f {
			return false
		}
	}
	return true
}

// validDigest requires an algorithm:hex form (e.g. sha256:deadbeef).
func validDigest(d string) bool {
	return digestRe.MatchString(d)
}

// pathEscapeRepo escapes each path segment of a repo name, preserving the
// slashes that separate namespace components (e.g. library/ubuntu).
func pathEscapeRepo(repo string) string {
	parts := strings.Split(strings.Trim(repo, "/"), "/")
	for i, p := range parts {
		parts[i] = url.PathEscape(p)
	}
	return strings.Join(parts, "/")
}

// nextLink extracts the next-page URL from a registry Link header (RFC 5988),
// resolving the target relative to base. The resolved URL is only returned when
// its scheme+host equal the registry base's (same-origin); an absolute off-host
// link (e.g. a malicious `Link: <http://evil/>; rel="next"`) stops pagination so
// the operator's credentials are never sent to it. Returns "" for no next page.
func nextLink(base, link string) string {
	if link == "" {
		return ""
	}
	baseURL, err := url.Parse(base)
	if err != nil {
		return ""
	}
	for _, part := range strings.Split(link, ",") {
		part = strings.TrimSpace(part)
		if !strings.Contains(part, `rel="next"`) {
			continue
		}
		start := strings.Index(part, "<")
		end := strings.Index(part, ">")
		if start < 0 || end < 0 || end <= start {
			continue
		}
		raw := part[start+1 : end]
		parsed, err := url.Parse(raw)
		if err != nil {
			return ""
		}
		resolved := baseURL.ResolveReference(parsed)
		// Only follow same-origin links: an off-host (or scheme-switched) target
		// would receive the registry's basic-auth credentials via c.send.
		if resolved.Scheme != baseURL.Scheme || !strings.EqualFold(resolved.Host, baseURL.Host) {
			return ""
		}
		return resolved.String()
	}
	return ""
}

// sameSite reports whether hosts a and b belong to the same registrable domain
// (eTLD+1). Cross-host realms are legitimate within one provider (Docker Hub's
// registry-1.docker.io → auth.docker.io both resolve to docker.io), so an exact
// host match is too strict. On a parse failure it falls back to exact-host
// equality.
func sameSite(a, b string) bool {
	ea, err1 := publicsuffix.EffectiveTLDPlusOne(strings.ToLower(a))
	eb, err2 := publicsuffix.EffectiveTLDPlusOne(strings.ToLower(b))
	if err1 != nil || err2 != nil {
		return strings.EqualFold(a, b) // fall back to exact host match
	}
	return strings.EqualFold(ea, eb)
}

func readAll(resp *http.Response) ([]byte, error) {
	defer resp.Body.Close()
	b, err := io.ReadAll(io.LimitReader(resp.Body, 32<<20))
	if err != nil {
		return nil, errf(http.StatusBadGateway, "BadGateway", "registry: read body: %v", err)
	}
	return b, nil
}

// ---- error/JSON rendering (contract error body {error,code,reason}) -------

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
