package registry

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/aimemalaika/Kestrel/internal/auth"
)

// fakeRegistry is a configurable httptest OCI v2 registry.
type fakeRegistry struct {
	t              *testing.T
	catalog        []string
	tags           map[string][]string
	manifests      map[string]manifestFixture // keyed by repo+":"+ref
	blobs          map[string][]byte          // keyed by repo+":"+digest (config blobs)
	requireBearer  bool                       // emit a 401 Bearer challenge first
	requireBasic   string                     // "user:pass" required on requests (Authorization: Basic)
	tokenEndpoint  string                     // realm URL for the challenge
	issuedToken    string                     // token the retry must carry
	deleted        []string                   // "repo@digest" of DELETEs that reached us
	sawBearerRetry bool
}

type manifestFixture struct {
	contentType string
	digest      string // Docker-Content-Digest to return ("" = omit)
	body        []byte
}

func key(repo, ref string) string { return repo + ":" + ref }

func (f *fakeRegistry) handler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Basic-auth gate.
		if f.requireBasic != "" {
			u, p, ok := r.BasicAuth()
			if !ok || u+":"+p != f.requireBasic {
				http.Error(w, "need basic", http.StatusUnauthorized)
				return
			}
		}
		// Bearer challenge: first unauthenticated hit gets a 401 + WWW-Authenticate.
		if f.requireBearer {
			auth := r.Header.Get("Authorization")
			if !strings.HasPrefix(auth, "Bearer ") {
				w.Header().Set("WWW-Authenticate",
					fmt.Sprintf(`Bearer realm="%s",service="reg.test",scope="repository:x:pull"`, f.tokenEndpoint))
				w.WriteHeader(http.StatusUnauthorized)
				return
			}
			if auth == "Bearer "+f.issuedToken {
				f.sawBearerRetry = true
			} else {
				http.Error(w, "bad token", http.StatusUnauthorized)
				return
			}
		}

		switch {
		case r.URL.Path == "/v2/_catalog":
			writeJSON(w, 200, catalogResp{Repositories: f.catalog})
		case strings.HasSuffix(r.URL.Path, "/tags/list"):
			repo := strings.TrimSuffix(strings.TrimPrefix(r.URL.Path, "/v2/"), "/tags/list")
			writeJSON(w, 200, tagsResp{Tags: f.tags[repo]})
		case strings.Contains(r.URL.Path, "/blobs/"):
			idx := strings.Index(r.URL.Path, "/blobs/")
			repo := strings.TrimPrefix(r.URL.Path[:idx], "/v2/")
			dg, _ := url.PathUnescape(r.URL.Path[idx+len("/blobs/"):])
			b, ok := f.blobs[key(repo, dg)]
			if !ok {
				http.Error(w, "no such blob", http.StatusNotFound)
				return
			}
			w.WriteHeader(200)
			_, _ = w.Write(b)
		case strings.Contains(r.URL.Path, "/manifests/"):
			idx := strings.Index(r.URL.Path, "/manifests/")
			repo := strings.TrimPrefix(r.URL.Path[:idx], "/v2/")
			ref := r.URL.Path[idx+len("/manifests/"):]
			ref, _ = url.PathUnescape(ref)
			if r.Method == http.MethodDelete {
				f.deleted = append(f.deleted, repo+"@"+ref)
				w.WriteHeader(http.StatusAccepted)
				return
			}
			mf, ok := f.manifests[key(repo, ref)]
			if !ok {
				http.Error(w, "no such manifest", http.StatusNotFound)
				return
			}
			if mf.contentType != "" {
				w.Header().Set("Content-Type", mf.contentType)
			}
			if mf.digest != "" {
				w.Header().Set("Docker-Content-Digest", mf.digest)
			}
			w.WriteHeader(200)
			_, _ = w.Write(mf.body)
		default:
			http.Error(w, "unexpected path "+r.URL.Path, http.StatusNotFound)
		}
	})
}

func mustJSON(t *testing.T, v any) []byte {
	t.Helper()
	b, err := json.Marshal(v)
	if err != nil {
		t.Fatal(err)
	}
	return b
}

func newHandler(t *testing.T, srvURL string, mut func(*Config)) *Handler {
	t.Helper()
	cfg := Config{URL: srvURL}
	if mut != nil {
		mut(&cfg)
	}
	return NewHandler(cfg)
}

func doReq(t *testing.T, h http.Handler, method, target string) (*http.Response, []byte) {
	t.Helper()
	req := httptest.NewRequest(method, target, nil)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	res := rr.Result()
	body, _ := io.ReadAll(res.Body)
	_ = res.Body.Close()
	return res, body
}

func TestCatalogAndTags(t *testing.T) {
	f := &fakeRegistry{
		catalog: []string{"library/ubuntu", "app/api"},
		tags:    map[string][]string{"library/ubuntu": {"20.04", "latest"}},
	}
	srv := httptest.NewServer(f.handler())
	defer srv.Close()
	h := newHandler(t, srv.URL, nil)

	res, body := doReq(t, h, http.MethodGet, "/api/registry/repos")
	if res.StatusCode != 200 {
		t.Fatalf("repos status %d: %s", res.StatusCode, body)
	}
	var repos struct {
		Repos []string `json:"repos"`
	}
	if err := json.Unmarshal(body, &repos); err != nil {
		t.Fatal(err)
	}
	if len(repos.Repos) != 2 || repos.Repos[0] != "library/ubuntu" {
		t.Fatalf("repos = %v", repos.Repos)
	}

	res, body = doReq(t, h, http.MethodGet, "/api/registry/tags?repo="+url.QueryEscape("library/ubuntu"))
	if res.StatusCode != 200 {
		t.Fatalf("tags status %d: %s", res.StatusCode, body)
	}
	var tags struct {
		Tags []string `json:"tags"`
	}
	_ = json.Unmarshal(body, &tags)
	if len(tags.Tags) != 2 || tags.Tags[1] != "latest" {
		t.Fatalf("tags = %v", tags.Tags)
	}
}

func TestGetImageManifest(t *testing.T) {
	m := manifest{
		MediaType: mtOCIManifest,
		Config:    descriptor{Size: 100},
		Layers: []descriptor{
			{Size: 500},
			{Size: 1500},
		},
	}
	body := mustJSON(t, m)
	f := &fakeRegistry{
		manifests: map[string]manifestFixture{
			key("library/ubuntu", "latest"): {
				contentType: mtOCIManifest,
				digest:      "sha256:deadbeef",
				body:        body,
			},
		},
	}
	srv := httptest.NewServer(f.handler())
	defer srv.Close()
	h := newHandler(t, srv.URL, nil)

	res, respBody := doReq(t, h, http.MethodGet,
		"/api/registry/image?repo="+url.QueryEscape("library/ubuntu")+"&tag=latest")
	if res.StatusCode != 200 {
		t.Fatalf("image status %d: %s", res.StatusCode, respBody)
	}
	var img Image
	if err := json.Unmarshal(respBody, &img); err != nil {
		t.Fatal(err)
	}
	if img.Digest != "sha256:deadbeef" {
		t.Fatalf("digest = %q", img.Digest)
	}
	if img.Layers != 2 {
		t.Fatalf("layers = %d", img.Layers)
	}
	if img.Size != 2100 { // 100 + 500 + 1500
		t.Fatalf("size = %d", img.Size)
	}
}

func TestGetImageComputesDigestWhenHeaderMissing(t *testing.T) {
	m := manifest{MediaType: mtDockerManifest, Config: descriptor{Size: 1}, Layers: []descriptor{{Size: 2}}}
	body := mustJSON(t, m)
	want := fmt.Sprintf("sha256:%x", sha256.Sum256(body))
	f := &fakeRegistry{
		manifests: map[string]manifestFixture{
			key("app/api", "v1"): {contentType: mtDockerManifest, body: body}, // no digest header
		},
	}
	srv := httptest.NewServer(f.handler())
	defer srv.Close()
	h := newHandler(t, srv.URL, nil)

	_, respBody := doReq(t, h, http.MethodGet, "/api/registry/image?repo=app/api&tag=v1")
	var img Image
	_ = json.Unmarshal(respBody, &img)
	if img.Digest != want {
		t.Fatalf("computed digest = %q, want %q", img.Digest, want)
	}
}

func TestGetImageIndex(t *testing.T) {
	child := manifest{
		MediaType: mtOCIManifest,
		Config:    descriptor{Size: 10},
		Layers:    []descriptor{{Size: 40}, {Size: 50}, {Size: 60}},
	}
	childBody := mustJSON(t, child)
	childDigest := "sha256:child123"

	index := manifest{
		MediaType: mtOCIIndex,
		Manifests: []descriptor{
			{MediaType: mtOCIManifest, Digest: "sha256:other", Platform: &platform{OS: "linux", Architecture: "arm64"}},
			{MediaType: mtOCIManifest, Digest: childDigest, Platform: &platform{OS: "linux", Architecture: "amd64"}},
		},
	}
	indexBody := mustJSON(t, index)

	f := &fakeRegistry{
		manifests: map[string]manifestFixture{
			key("library/ubuntu", "latest"):    {contentType: mtOCIIndex, digest: "sha256:indexdigest", body: indexBody},
			key("library/ubuntu", childDigest): {contentType: mtOCIManifest, digest: childDigest, body: childBody},
		},
	}
	srv := httptest.NewServer(f.handler())
	defer srv.Close()
	h := newHandler(t, srv.URL, nil)

	_, respBody := doReq(t, h, http.MethodGet, "/api/registry/image?repo=library/ubuntu&tag=latest")
	var img Image
	if err := json.Unmarshal(respBody, &img); err != nil {
		t.Fatal(err)
	}
	// Reported digest is the requested ref's (the index) digest.
	if img.Digest != "sha256:indexdigest" {
		t.Fatalf("digest = %q, want index digest", img.Digest)
	}
	// size/layers resolved from the linux/amd64 child.
	if img.Layers != 3 {
		t.Fatalf("layers = %d, want 3", img.Layers)
	}
	if img.Size != 160 { // 10 + 40 + 50 + 60
		t.Fatalf("size = %d, want 160", img.Size)
	}
}

func TestBearerChallengeFlow(t *testing.T) {
	m := manifest{MediaType: mtOCIManifest, Config: descriptor{Size: 1}, Layers: []descriptor{{Size: 1}}}
	f := &fakeRegistry{
		requireBearer: true,
		issuedToken:   "tok-abc",
		catalog:       []string{"a/b"},
		tags:          map[string][]string{"a/b": {"t1"}},
		manifests: map[string]manifestFixture{
			key("a/b", "t1"): {contentType: mtOCIManifest, digest: "sha256:x", body: mustJSON(t, m)},
		},
	}
	// Token endpoint issues the token; assert it was asked with the scope. The
	// realm must be https (non-https realms are refused outright), so use a TLS
	// server and trust its self-signed cert via InsecureSkipVerify.
	var tokenHits int
	tokenSrv := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		tokenHits++
		if r.URL.Query().Get("service") != "reg.test" {
			t.Errorf("token req missing service, got %q", r.URL.RawQuery)
		}
		writeJSON(w, 200, tokenResp{Token: "tok-abc"})
	}))
	defer tokenSrv.Close()
	f.tokenEndpoint = tokenSrv.URL

	srv := httptest.NewServer(f.handler())
	defer srv.Close()
	h := newHandler(t, srv.URL, func(c *Config) { c.InsecureSkipVerify = true })

	res, body := doReq(t, h, http.MethodGet, "/api/registry/repos")
	if res.StatusCode != 200 {
		t.Fatalf("repos with bearer: status %d: %s", res.StatusCode, body)
	}
	if tokenHits == 0 {
		t.Fatal("token endpoint was never hit")
	}
	if !f.sawBearerRetry {
		t.Fatal("registry never saw the Bearer retry")
	}
}

func TestBasicAuthSent(t *testing.T) {
	f := &fakeRegistry{
		requireBasic: "alice:s3cret",
		catalog:      []string{"x/y"},
	}
	srv := httptest.NewServer(f.handler())
	defer srv.Close()
	h := newHandler(t, srv.URL, func(c *Config) {
		c.Username, c.Password = "alice", "s3cret"
	})

	res, body := doReq(t, h, http.MethodGet, "/api/registry/repos")
	if res.StatusCode != 200 {
		t.Fatalf("basic-auth repos status %d: %s", res.StatusCode, body)
	}
}

func TestDeleteEnabled(t *testing.T) {
	f := &fakeRegistry{}
	srv := httptest.NewServer(f.handler())
	defer srv.Close()
	h := newHandler(t, srv.URL, func(c *Config) { c.AllowDelete = true })

	res, body := doReq(t, h, http.MethodDelete, "/api/registry/image?repo=app/api&digest=sha256:abc")
	if res.StatusCode != http.StatusNoContent {
		t.Fatalf("delete status %d: %s", res.StatusCode, body)
	}
	if len(f.deleted) != 1 || f.deleted[0] != "app/api@sha256:abc" {
		t.Fatalf("upstream deletes = %v", f.deleted)
	}
}

func TestDeleteDisabled(t *testing.T) {
	f := &fakeRegistry{}
	srv := httptest.NewServer(f.handler())
	defer srv.Close()
	h := newHandler(t, srv.URL, nil) // AllowDelete false

	res, _ := doReq(t, h, http.MethodDelete, "/api/registry/image?repo=app/api&digest=sha256:abc")
	if res.StatusCode != http.StatusMethodNotAllowed && res.StatusCode != http.StatusForbidden {
		t.Fatalf("disabled delete status = %d, want 405/403", res.StatusCode)
	}
	if len(f.deleted) != 0 {
		t.Fatalf("delete was forwarded upstream despite being disabled: %v", f.deleted)
	}
}

func TestConfigEndpoint(t *testing.T) {
	srv := httptest.NewServer((&fakeRegistry{}).handler())
	defer srv.Close()
	for _, tc := range []struct {
		allow bool
	}{{false}, {true}} {
		h := newHandler(t, srv.URL, func(c *Config) { c.AllowDelete = tc.allow })
		_, body := doReq(t, h, http.MethodGet, "/api/registry/config")
		var cfg struct {
			DeletesEnabled bool `json:"deletesEnabled"`
		}
		_ = json.Unmarshal(body, &cfg)
		if cfg.DeletesEnabled != tc.allow {
			t.Fatalf("deletesEnabled = %v, want %v", cfg.DeletesEnabled, tc.allow)
		}
	}
}

func TestNotConfigured503(t *testing.T) {
	h := NewHandler(Config{}) // empty URL
	for _, target := range []struct {
		method, path string
	}{
		{http.MethodGet, "/api/registry/repos"},
		{http.MethodGet, "/api/registry/tags?repo=a/b"},
		{http.MethodGet, "/api/registry/image?repo=a/b&tag=latest"},
		{http.MethodGet, "/api/registry/config"},
		{http.MethodDelete, "/api/registry/image?repo=a/b&digest=sha256:x"},
	} {
		res, body := doReq(t, h, target.method, target.path)
		if res.StatusCode != http.StatusServiceUnavailable {
			t.Fatalf("%s %s: status %d, want 503 (%s)", target.method, target.path, res.StatusCode, body)
		}
		var eb struct {
			Error  string `json:"error"`
			Code   int    `json:"code"`
			Reason string `json:"reason"`
		}
		if err := json.Unmarshal(body, &eb); err != nil || eb.Code != 503 {
			t.Fatalf("%s: bad error body %s", target.path, body)
		}
	}
}

func TestBadQueryParams(t *testing.T) {
	srv := httptest.NewServer((&fakeRegistry{}).handler())
	defer srv.Close()
	h := newHandler(t, srv.URL, func(c *Config) { c.AllowDelete = true })

	for _, path := range []string{
		"/api/registry/tags",             // missing repo
		"/api/registry/image?repo=a/b",   // missing tag
		"/api/registry/image?tag=latest", // missing repo
	} {
		res, body := doReq(t, h, http.MethodGet, path)
		if res.StatusCode != http.StatusBadRequest {
			t.Fatalf("%s: status %d, want 400 (%s)", path, res.StatusCode, body)
		}
	}
	// DELETE missing digest.
	res, _ := doReq(t, h, http.MethodDelete, "/api/registry/image?repo=a/b")
	if res.StatusCode != http.StatusBadRequest {
		t.Fatalf("delete missing digest: status %d, want 400", res.StatusCode)
	}
}

// ---- security: credential forwarding + input validation ------------------

// TestSameSite covers the eTLD+1 allow-creds decision for the token realm.
func TestSameSite(t *testing.T) {
	cases := []struct {
		a, b string
		want bool
	}{
		// Docker Hub: registry and auth differ by host but share eTLD+1.
		{"registry-1.docker.io", "auth.docker.io", true},
		{"registry-1.foo.io", "auth.foo.io", true},
		// Exact host match.
		{"registry.example.com", "registry.example.com", true},
		// Different registrable domain: a cross-site realm.
		{"registry.example.com", "evil.example", false},
		{"registry.example.com", "evil.com", false},
	}
	for _, tc := range cases {
		if got := sameSite(tc.a, tc.b); got != tc.want {
			t.Errorf("sameSite(%q, %q) = %v, want %v", tc.a, tc.b, got, tc.want)
		}
	}
}

// TestTokenCredWithheldFromHTTPRealm asserts that when the realm is http (not
// https), the operator's basic-auth credentials are NOT forwarded to it, and
// the handshake proceeds anonymously so the flow still completes.
// TestTokenHTTPRealmRefused asserts that an http:// token realm is refused
// outright — no request (anonymous or credentialed) is ever made to it — so a
// hostile/compromised registry cannot drive a blind SSRF at an internal host.
func TestTokenHTTPRealmRefused(t *testing.T) {
	f := &fakeRegistry{
		requireBearer: true,
		issuedToken:   "tok-xyz",
		catalog:       []string{"a/b"},
	}
	var tokenHits int32
	tokenSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&tokenHits, 1)
		writeJSON(w, 200, tokenResp{Token: "tok-xyz"})
	}))
	defer tokenSrv.Close()
	f.tokenEndpoint = tokenSrv.URL // http:// realm

	srv := httptest.NewServer(f.handler())
	defer srv.Close()
	h := newHandler(t, srv.URL, func(c *Config) { c.Username, c.Password = "op", "s3cret" })

	res, body := doReq(t, h, http.MethodGet, "/api/registry/repos")
	if res.StatusCode != http.StatusBadGateway {
		t.Fatalf("repos status %d, want 502 for a non-https token realm: %s", res.StatusCode, body)
	}
	if n := atomic.LoadInt32(&tokenHits); n != 0 {
		t.Fatalf("http token realm was contacted %d times, want 0 (must be refused before any request)", n)
	}
}

// TestTokenCredSentToHTTPSSameSiteRealm is the positive case: an https realm on
// the same registrable domain (both 127.0.0.1 here) receives the basic auth.
func TestTokenCredSentToHTTPSSameSiteRealm(t *testing.T) {
	f := &fakeRegistry{
		requireBearer: true,
		issuedToken:   "tok-ok",
		catalog:       []string{"a/b"},
	}
	var sawAuth int32
	tokenSrv := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if u, p, ok := r.BasicAuth(); ok && u == "op" && p == "s3cret" {
			atomic.StoreInt32(&sawAuth, 1)
		}
		writeJSON(w, 200, tokenResp{Token: "tok-ok"})
	}))
	defer tokenSrv.Close()
	f.tokenEndpoint = tokenSrv.URL // https realm, same host (127.0.0.1)

	srv := httptest.NewTLSServer(f.handler())
	defer srv.Close()
	h := newHandler(t, srv.URL, func(c *Config) {
		c.Username, c.Password = "op", "s3cret"
		c.InsecureSkipVerify = true // trust the httptest self-signed certs
	})

	res, body := doReq(t, h, http.MethodGet, "/api/registry/repos")
	if res.StatusCode != 200 {
		t.Fatalf("repos status %d: %s", res.StatusCode, body)
	}
	if atomic.LoadInt32(&sawAuth) == 0 {
		t.Fatal("basic auth was not sent to an https same-site realm")
	}
}

// TestOffHostLinkNotFollowed asserts catalog pagination stops at an off-host
// Link: rel="next" target (never contacting it, so creds cannot leak) while
// still returning the first page's repos.
func TestOffHostLinkNotFollowed(t *testing.T) {
	var evilHits int32
	evil := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&evilHits, 1)
		writeJSON(w, 200, catalogResp{Repositories: []string{"evil/pwned"}})
	}))
	defer evil.Close()

	reg := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/v2/_catalog" {
			w.Header().Set("Link", "<"+evil.URL+"/v2/_catalog>; rel=\"next\"")
			writeJSON(w, 200, catalogResp{Repositories: []string{"library/ubuntu"}})
			return
		}
		http.Error(w, "unexpected path "+r.URL.Path, http.StatusNotFound)
	}))
	defer reg.Close()

	h := newHandler(t, reg.URL, nil)
	res, body := doReq(t, h, http.MethodGet, "/api/registry/repos")
	if res.StatusCode != 200 {
		t.Fatalf("repos status %d: %s", res.StatusCode, body)
	}
	var repos struct {
		Repos []string `json:"repos"`
	}
	if err := json.Unmarshal(body, &repos); err != nil {
		t.Fatal(err)
	}
	if len(repos.Repos) != 1 || repos.Repos[0] != "library/ubuntu" {
		t.Fatalf("repos = %v, want [library/ubuntu] (off-host page must not be merged)", repos.Repos)
	}
	if n := atomic.LoadInt32(&evilHits); n != 0 {
		t.Fatalf("off-host Link target was contacted %d times, want 0", n)
	}
}

// TestInvalidParamsRejected asserts traversal/invalid params are rejected with
// 400 before any upstream request is made.
func TestInvalidParamsRejected(t *testing.T) {
	var upstreamHits int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&upstreamHits, 1)
		http.Error(w, "should not be reached", http.StatusInternalServerError)
	}))
	defer srv.Close()
	h := newHandler(t, srv.URL, func(c *Config) { c.AllowDelete = true })

	cases := []struct{ method, path string }{
		{http.MethodGet, "/api/registry/tags?repo=" + url.QueryEscape("../../foo")},
		{http.MethodGet, "/api/registry/image?repo=" + url.QueryEscape("a/../b") + "&tag=latest"},
		{http.MethodGet, "/api/registry/image?repo=good/repo&tag=" + url.QueryEscape("a/b")},
		{http.MethodDelete, "/api/registry/image?repo=good/repo&digest=notadigest"},
	}
	for _, tc := range cases {
		res, body := doReq(t, h, tc.method, tc.path)
		if res.StatusCode != http.StatusBadRequest {
			t.Fatalf("%s %s: status %d, want 400 (%s)", tc.method, tc.path, res.StatusCode, body)
		}
	}
	if n := atomic.LoadInt32(&upstreamHits); n != 0 {
		t.Fatalf("upstream contacted %d times for invalid params, want 0", n)
	}
}

// TestNestedIndexRejected asserts a child that is itself an index yields a clear
// 502 rather than a silent Layers:0/Size:0.
func TestNestedIndexRejected(t *testing.T) {
	inner := manifest{MediaType: mtOCIIndex, Manifests: []descriptor{
		{MediaType: mtOCIManifest, Digest: "sha256:leaf", Platform: &platform{OS: "linux", Architecture: "amd64"}},
	}}
	outer := manifest{MediaType: mtOCIIndex, Manifests: []descriptor{
		{MediaType: mtOCIIndex, Digest: "sha256:inner", Platform: &platform{OS: "linux", Architecture: "amd64"}},
	}}
	f := &fakeRegistry{manifests: map[string]manifestFixture{
		key("a/b", "latest"):       {contentType: mtOCIIndex, digest: "sha256:outer", body: mustJSON(t, outer)},
		key("a/b", "sha256:inner"): {contentType: mtOCIIndex, digest: "sha256:inner", body: mustJSON(t, inner)},
	}}
	srv := httptest.NewServer(f.handler())
	defer srv.Close()
	h := newHandler(t, srv.URL, nil)

	res, body := doReq(t, h, http.MethodGet, "/api/registry/image?repo=a/b&tag=latest")
	if res.StatusCode != http.StatusBadGateway {
		t.Fatalf("nested index status %d, want 502 (%s)", res.StatusCode, body)
	}
}

func TestUpstreamNotFoundMaps404(t *testing.T) {
	f := &fakeRegistry{manifests: map[string]manifestFixture{}} // nothing registered
	srv := httptest.NewServer(f.handler())
	defer srv.Close()
	h := newHandler(t, srv.URL, nil)

	res, _ := doReq(t, h, http.MethodGet, "/api/registry/image?repo=a/b&tag=missing")
	if res.StatusCode != http.StatusNotFound {
		t.Fatalf("missing manifest status = %d, want 404", res.StatusCode)
	}
}

// doReqCtx drives ServeHTTP with a request carrying the given identity.
func doReqCtx(t *testing.T, h http.Handler, method, target string, id auth.Identity) (*http.Response, []byte) {
	t.Helper()
	req := httptest.NewRequest(method, target, nil).
		WithContext(auth.WithIdentity(context.Background(), id))
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	res := rr.Result()
	body, _ := io.ReadAll(res.Body)
	_ = res.Body.Close()
	return res, body
}

func TestRegistryGroupAllowList(t *testing.T) {
	f := &fakeRegistry{catalog: []string{"app/api"}}
	srv := httptest.NewServer(f.handler())
	defer srv.Close()
	h := newHandler(t, srv.URL, func(c *Config) { c.AllowedGroups = []string{"ops"} })

	// Token-bearing user NOT in an allowed group → 403, never reaches upstream.
	if res, _ := doReqCtx(t, h, http.MethodGet, "/api/registry/repos", auth.Identity{User: "d", Token: "t", Groups: []string{"devs"}}); res.StatusCode != 403 {
		t.Fatalf("non-member should be 403, got %d", res.StatusCode)
	}
	// User in an allowed group → allowed (200).
	if res, body := doReqCtx(t, h, http.MethodGet, "/api/registry/repos", auth.Identity{User: "o", Token: "t", Groups: []string{"ops"}}); res.StatusCode != 200 {
		t.Fatalf("member should be 200, got %d: %s", res.StatusCode, body)
	}
	// Single-operator (no token) → not restricted (200).
	if res, _ := doReqCtx(t, h, http.MethodGet, "/api/registry/repos", auth.Identity{User: "operator"}); res.StatusCode != 200 {
		t.Fatalf("single-operator should bypass the group gate, got %d", res.StatusCode)
	}
}

func TestCatalogPaginationFollowsLink(t *testing.T) {
	// Two-page catalog via the Link: rel="next" cursor header.
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v2/_catalog" {
			http.Error(w, "x", 404)
			return
		}
		if r.URL.Query().Get("last") == "" {
			w.Header().Set("Link", `</v2/_catalog?n=1000&last=a/one>; rel="next"`)
			writeJSON(w, 200, catalogResp{Repositories: []string{"a/one"}})
			return
		}
		writeJSON(w, 200, catalogResp{Repositories: []string{"b/two"}})
	}))
	defer srv.Close()
	h := newHandler(t, srv.URL, nil)

	res, body := doReq(t, h, http.MethodGet, "/api/registry/repos")
	if res.StatusCode != 200 {
		t.Fatalf("status %d: %s", res.StatusCode, body)
	}
	var got struct {
		Repos []string `json:"repos"`
	}
	if err := json.Unmarshal(body, &got); err != nil {
		t.Fatal(err)
	}
	if len(got.Repos) != 2 || got.Repos[0] != "a/one" || got.Repos[1] != "b/two" {
		t.Fatalf("pagination should aggregate both pages, got %v", got.Repos)
	}
}

// historyFixture registers a tag whose manifest points at a config blob.
func (f *fakeRegistry) addTag(t *testing.T, repo, tag, cfgDigest, blob string, layerSize int64) {
	t.Helper()
	if f.manifests == nil {
		f.manifests = map[string]manifestFixture{}
	}
	if f.blobs == nil {
		f.blobs = map[string][]byte{}
	}
	m := manifest{MediaType: mtOCIManifest, Config: descriptor{Digest: cfgDigest, Size: 10}, Layers: []descriptor{{Size: layerSize}}}
	f.manifests[key(repo, tag)] = manifestFixture{contentType: mtOCIManifest, digest: "sha256:m" + tag, body: mustJSON(t, m)}
	if blob != "" {
		f.blobs[key(repo, cfgDigest)] = []byte(blob)
	}
}

func TestGetImageCreated(t *testing.T) {
	f := &fakeRegistry{}
	f.addTag(t, "team/web", "v1", "sha256:aa01", `{"created":"2026-01-02T03:04:05Z"}`, 90)
	srv := httptest.NewServer(f.handler())
	defer srv.Close()
	h := newHandler(t, srv.URL, nil)

	res, body := doReq(t, h, http.MethodGet, "/api/registry/image?repo=team/web&tag=v1")
	if res.StatusCode != 200 {
		t.Fatalf("status %d: %s", res.StatusCode, body)
	}
	var img Image
	_ = json.Unmarshal(body, &img)
	if img.Created != "2026-01-02T03:04:05Z" {
		t.Fatalf("created = %q", img.Created)
	}
}

func TestGetImageCreatedBestEffort(t *testing.T) {
	f := &fakeRegistry{}
	f.addTag(t, "team/web", "noblob", "sha256:bb01", "", 90)                // blob 404
	f.addTag(t, "team/web", "nofield", "sha256:bb02", `{"os":"linux"}`, 90) // no created
	f.addTag(t, "team/web", "badjson", "sha256:bb03", `not json`, 90)
	srv := httptest.NewServer(f.handler())
	defer srv.Close()
	h := newHandler(t, srv.URL, nil)

	for _, tag := range []string{"noblob", "nofield", "badjson"} {
		res, body := doReq(t, h, http.MethodGet, "/api/registry/image?repo=team/web&tag="+tag)
		if res.StatusCode != 200 {
			t.Fatalf("%s: status %d: %s", tag, res.StatusCode, body)
		}
		var img Image
		_ = json.Unmarshal(body, &img)
		if img.Created != "" || img.Size != 100 {
			t.Fatalf("%s: created=%q size=%d", tag, img.Created, img.Size)
		}
	}
}

func TestHistorySortedNewestFirst(t *testing.T) {
	f := &fakeRegistry{tags: map[string][]string{"team/web": {"v1", "v3", "v2", "none", "alpha"}}}
	f.addTag(t, "team/web", "v1", "sha256:c1", `{"created":"2026-01-01T00:00:00Z"}`, 100)
	f.addTag(t, "team/web", "v2", "sha256:c2", `{"created":"2026-02-01T00:00:00Z"}`, 200)
	f.addTag(t, "team/web", "v3", "sha256:c3", `{"created":"2026-03-01T00:00:00Z"}`, 300)
	f.addTag(t, "team/web", "none", "sha256:c4", "", 50)
	f.addTag(t, "team/web", "alpha", "sha256:c5", `{}`, 50)
	srv := httptest.NewServer(f.handler())
	defer srv.Close()
	h := newHandler(t, srv.URL, nil)

	res, body := doReq(t, h, http.MethodGet, "/api/registry/history?repo=team/web")
	if res.StatusCode != 200 {
		t.Fatalf("status %d: %s", res.StatusCode, body)
	}
	var out struct {
		Tags []TagHistory `json:"tags"`
	}
	if err := json.Unmarshal(body, &out); err != nil {
		t.Fatal(err)
	}
	var order []string
	for _, th := range out.Tags {
		order = append(order, th.Tag)
	}
	if got := strings.Join(order, ","); got != "v3,v2,v1,none,alpha" {
		t.Fatalf("order = %s", got)
	}
	if out.Tags[0].Digest != "sha256:mv3" || out.Tags[0].Size != 310 || out.Tags[0].Layers != 1 ||
		out.Tags[0].Created != "2026-03-01T00:00:00Z" {
		t.Fatalf("row0 = %+v", out.Tags[0])
	}
	if out.Tags[3].Created != "" {
		t.Fatalf("none created = %q", out.Tags[3].Created)
	}
}

func TestHistoryUnconfigured503(t *testing.T) {
	h := NewHandler(Config{})
	res, _ := doReq(t, h, http.MethodGet, "/api/registry/history?repo=team/web")
	if res.StatusCode != http.StatusServiceUnavailable {
		t.Fatalf("status = %d", res.StatusCode)
	}
}

func TestHistoryBadRepo400(t *testing.T) {
	f := &fakeRegistry{}
	srv := httptest.NewServer(f.handler())
	defer srv.Close()
	h := newHandler(t, srv.URL, nil)
	for _, q := range []string{"", "?repo=", "?repo=../x", "?repo=a//b"} {
		res, body := doReq(t, h, http.MethodGet, "/api/registry/history"+q)
		if res.StatusCode != http.StatusBadRequest {
			t.Fatalf("%q: status %d: %s", q, res.StatusCode, body)
		}
	}
	res, _ := doReq(t, h, http.MethodPost, "/api/registry/history?repo=team/web")
	if res.StatusCode != http.StatusMethodNotAllowed {
		t.Fatalf("POST status = %d", res.StatusCode)
	}
}

func TestSummary(t *testing.T) {
	f := &fakeRegistry{
		catalog: []string{"team/web", "team/api", "team/broken"},
		tags: map[string][]string{
			"team/web":    {"v1", "latest"},
			"team/api":    {"v9"},
			"team/broken": {"v1"},
		},
	}
	f.addTag(t, "team/web", "v1", "sha256:d1", `{"created":"2026-01-01T00:00:00Z"}`, 100)
	f.addTag(t, "team/web", "latest", "sha256:d2", `{"created":"2026-05-01T00:00:00Z"}`, 200)
	f.addTag(t, "team/api", "v9", "sha256:d3", `{"created":"2026-02-01T00:00:00Z"}`, 50)
	srv := httptest.NewServer(f.handler())
	defer srv.Close()
	h := newHandler(t, srv.URL, nil)

	res, body := doReq(t, h, http.MethodGet, "/api/registry/summary")
	if res.StatusCode != 200 {
		t.Fatalf("status %d: %s", res.StatusCode, body)
	}
	var out struct {
		Repos []RepoSummary `json:"repos"`
	}
	if err := json.Unmarshal(body, &out); err != nil {
		t.Fatal(err)
	}
	if len(out.Repos) != 3 {
		t.Fatalf("repos = %+v", out.Repos)
	}
	by := map[string]RepoSummary{}
	for _, r := range out.Repos {
		by[r.Repo] = r
	}
	web := by["team/web"]
	if len(web.Tags) != 2 || web.Digest != "sha256:mlatest" || web.Created != "2026-05-01T00:00:00Z" || web.Size != 210 {
		t.Fatalf("web = %+v", web)
	}
	api := by["team/api"]
	if api.Digest != "sha256:mv9" || api.Created != "2026-02-01T00:00:00Z" {
		t.Fatalf("api (tags[0] fallback) = %+v", api)
	}
	br := by["team/broken"]
	if br.Digest != "" || br.Created != "" || br.Size != 0 || len(br.Tags) != 1 {
		t.Fatalf("broken = %+v", br)
	}
}

func TestSummaryUnconfigured503AndMethod(t *testing.T) {
	res, _ := doReq(t, NewHandler(Config{}), http.MethodGet, "/api/registry/summary")
	if res.StatusCode != http.StatusServiceUnavailable {
		t.Fatalf("status = %d", res.StatusCode)
	}
	f := &fakeRegistry{}
	srv := httptest.NewServer(f.handler())
	defer srv.Close()
	res, _ = doReq(t, newHandler(t, srv.URL, nil), http.MethodPost, "/api/registry/summary")
	if res.StatusCode != http.StatusMethodNotAllowed {
		t.Fatalf("POST status = %d", res.StatusCode)
	}
}
