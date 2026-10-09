package helm

import (
	"bytes"
	"compress/gzip"
	"context"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	kubefake "k8s.io/client-go/kubernetes/fake"

	"github.com/aimemalaika/Kestrel/internal/auth"
	"github.com/aimemalaika/Kestrel/internal/k8s"
)

// encodeRelease builds the Secret.Data["release"] payload the way Helm v3 does:
// base64(gzip(JSON)). client-go's fake clientset stores Data as raw []byte (it
// does NOT re-base64), so this matches what a real decoded Secret.Data holds.
func encodeRelease(t *testing.T, rel map[string]any) []byte {
	t.Helper()
	raw, err := json.Marshal(rel)
	if err != nil {
		t.Fatal(err)
	}
	var buf bytes.Buffer
	zw := gzip.NewWriter(&buf)
	if _, err := zw.Write(raw); err != nil {
		t.Fatal(err)
	}
	if err := zw.Close(); err != nil {
		t.Fatal(err)
	}
	return []byte(base64.StdEncoding.EncodeToString(buf.Bytes()))
}

func releaseSecret(t *testing.T, ns, name string, rev int, status string, payload []byte) *corev1.Secret {
	t.Helper()
	return &corev1.Secret{
		ObjectMeta: metav1.ObjectMeta{
			Namespace: ns,
			Name:      "sh.helm.release.v1." + name + ".v" + itoa(rev),
			Labels: map[string]string{
				"owner":   "helm",
				"name":    name,
				"version": itoa(rev),
				"status":  status,
			},
		},
		Type: helmReleaseSecretType,
		Data: map[string][]byte{"release": payload},
	}
}

func itoa(i int) string {
	if i == 0 {
		return "0"
	}
	neg := i < 0
	if neg {
		i = -i
	}
	var b []byte
	for i > 0 {
		b = append([]byte{byte('0' + i%10)}, b...)
		i /= 10
	}
	if neg {
		b = append([]byte{'-'}, b...)
	}
	return string(b)
}

func sampleRelease(name, ns string, rev int, status string) map[string]any {
	return map[string]any{
		"name":      name,
		"namespace": ns,
		"version":   rev,
		"info": map[string]any{
			"status":        status,
			"notes":         "Thank you for installing " + name,
			"last_deployed": "2024-01-02T15:04:05Z",
		},
		"chart": map[string]any{
			"metadata": map[string]any{
				"name":       "mychart",
				"version":    "1.2.3",
				"appVersion": "4.5.6",
			},
		},
		"config": map[string]any{
			"replicaCount": 3,
			"image":        map[string]any{"tag": "latest"},
		},
		"manifest": "---\napiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: d\n---\napiVersion: v1\nkind: Service\nmetadata:\n  name: s1\n---\napiVersion: v1\nkind: Service\nmetadata:\n  name: s2\n",
	}
}

// emptyTokenCtx drives requests as the single operator (empty token ⇒ the fake
// SA clientset on the accessor is used by UserClientset).
func emptyTokenCtx() context.Context {
	return auth.WithIdentity(context.Background(), auth.Identity{User: auth.Operator})
}

func newHandler(t *testing.T, secrets ...runtime.Object) *Handler {
	t.Helper()
	cs := kubefake.NewSimpleClientset(secrets...)
	acc := k8s.NewAccessorFromAll(nil, nil, cs)
	return NewHandler(acc, Config{})
}

func doReq(t *testing.T, h *Handler, method, target string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(method, target, nil).WithContext(emptyTokenCtx())
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func TestListReleasesMapsAllFields(t *testing.T) {
	sec := releaseSecret(t, "prod", "web", 1, "deployed", encodeRelease(t, sampleRelease("web", "prod", 1, "deployed")))
	h := newHandler(t, sec)

	rec := doReq(t, h, "GET", "/api/helm/releases")
	if rec.Code != 200 {
		t.Fatalf("code %d: %s", rec.Code, rec.Body.String())
	}
	var got []Release
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	if len(got) != 1 {
		t.Fatalf("want 1 release, got %d", len(got))
	}
	r := got[0]
	want := Release{
		Name: "web", Namespace: "prod", Revision: 1, Status: "deployed",
		Chart: "mychart", ChartVersion: "1.2.3", AppVersion: "4.5.6",
		Updated: "2024-01-02T15:04:05Z",
	}
	if r != want {
		t.Fatalf("release mismatch:\n got %+v\nwant %+v", r, want)
	}
}

func TestListReleasesFallsBackToSecretNamespace(t *testing.T) {
	// Release JSON with no namespace field ⇒ use the Secret's namespace.
	rel := sampleRelease("web", "", 1, "deployed")
	delete(rel, "namespace")
	sec := releaseSecret(t, "staging", "web", 1, "deployed", encodeRelease(t, rel))
	h := newHandler(t, sec)

	rec := doReq(t, h, "GET", "/api/helm/releases")
	var got []Release
	_ = json.Unmarshal(rec.Body.Bytes(), &got)
	if len(got) != 1 || got[0].Namespace != "staging" {
		t.Fatalf("want namespace staging, got %+v", got)
	}
}

func TestListReleasesKeepsHighestRevision(t *testing.T) {
	var secrets []runtime.Object
	for _, rev := range []int{1, 2, 3} {
		status := "superseded"
		if rev == 3 {
			status = "deployed"
		}
		secrets = append(secrets, releaseSecret(t, "prod", "web", rev, status,
			encodeRelease(t, sampleRelease("web", "prod", rev, status))))
	}
	h := newHandler(t, secrets...)

	rec := doReq(t, h, "GET", "/api/helm/releases")
	var got []Release
	_ = json.Unmarshal(rec.Body.Bytes(), &got)
	if len(got) != 1 {
		t.Fatalf("want 1 (deduped), got %d: %+v", len(got), got)
	}
	if got[0].Revision != 3 || got[0].Status != "deployed" {
		t.Fatalf("want rev 3 deployed, got rev %d status %s", got[0].Revision, got[0].Status)
	}
}

func TestListReleasesSorted(t *testing.T) {
	h := newHandler(t,
		releaseSecret(t, "prod", "zeta", 1, "deployed", encodeRelease(t, sampleRelease("zeta", "prod", 1, "deployed"))),
		releaseSecret(t, "prod", "alpha", 1, "deployed", encodeRelease(t, sampleRelease("alpha", "prod", 1, "deployed"))),
		releaseSecret(t, "dev", "mid", 1, "deployed", encodeRelease(t, sampleRelease("mid", "dev", 1, "deployed"))),
	)
	rec := doReq(t, h, "GET", "/api/helm/releases")
	var got []Release
	_ = json.Unmarshal(rec.Body.Bytes(), &got)
	if len(got) != 3 {
		t.Fatalf("want 3, got %d", len(got))
	}
	// Sorted by namespace then name: dev/mid, prod/alpha, prod/zeta.
	if got[0].Name != "mid" || got[1].Name != "alpha" || got[2].Name != "zeta" {
		t.Fatalf("bad sort order: %v", []string{got[0].Namespace + "/" + got[0].Name, got[1].Namespace + "/" + got[1].Name, got[2].Namespace + "/" + got[2].Name})
	}
}

func TestGetReleaseDecodesDetail(t *testing.T) {
	sec := releaseSecret(t, "prod", "web", 2, "deployed", encodeRelease(t, sampleRelease("web", "prod", 2, "deployed")))
	h := newHandler(t, sec)

	rec := doReq(t, h, "GET", "/api/helm/releases/detail?namespace=prod&name=web")
	if rec.Code != 200 {
		t.Fatalf("code %d: %s", rec.Code, rec.Body.String())
	}
	var got ReleaseDetail
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	if got.Revision != 2 {
		t.Fatalf("want rev 2, got %d", got.Revision)
	}
	if got.Notes != "Thank you for installing web" {
		t.Fatalf("notes mismatch: %q", got.Notes)
	}
	if got.ManifestSummary != "Deployment x1, Service x2" {
		t.Fatalf("manifestSummary mismatch: %q", got.ManifestSummary)
	}
	// values should be YAML rendering the config object.
	if !bytes.Contains([]byte(got.Values), []byte("replicaCount: 3")) {
		t.Fatalf("values YAML missing replicaCount: %q", got.Values)
	}
}

func TestGetReleasePicksHighestRevision(t *testing.T) {
	h := newHandler(t,
		releaseSecret(t, "prod", "web", 1, "superseded", encodeRelease(t, sampleRelease("web", "prod", 1, "superseded"))),
		releaseSecret(t, "prod", "web", 2, "deployed", encodeRelease(t, sampleRelease("web", "prod", 2, "deployed"))),
	)
	rec := doReq(t, h, "GET", "/api/helm/releases/detail?namespace=prod&name=web")
	var got ReleaseDetail
	_ = json.Unmarshal(rec.Body.Bytes(), &got)
	if got.Revision != 2 || got.Status != "deployed" {
		t.Fatalf("want rev2/deployed, got rev%d/%s", got.Revision, got.Status)
	}
}

func TestGetReleaseNotFound(t *testing.T) {
	h := newHandler(t)
	rec := doReq(t, h, "GET", "/api/helm/releases/detail?namespace=prod&name=missing")
	if rec.Code != http.StatusNotFound {
		t.Fatalf("want 404, got %d: %s", rec.Code, rec.Body.String())
	}
	assertErrorBody(t, rec)
}

func TestGetReleaseBadParams(t *testing.T) {
	h := newHandler(t)
	for _, target := range []string{
		"/api/helm/releases/detail",
		"/api/helm/releases/detail?namespace=prod",
		"/api/helm/releases/detail?name=web",
		"/api/helm/releases/detail?namespace=prod&name=bad%2Fname",
		"/api/helm/releases/detail?namespace=pr%20od&name=web",
	} {
		rec := doReq(t, h, "GET", target)
		if rec.Code != http.StatusBadRequest {
			t.Errorf("%s: want 400, got %d", target, rec.Code)
		}
	}
}

// TestGetReleaseRejectsSelectorInjection locks in that a crafted name carrying
// label-selector meta characters is rejected with 400 before any List — so it can
// never alter the owner=helm,name=<name> selector to widen the match.
func TestGetReleaseRejectsSelectorInjection(t *testing.T) {
	h := newHandler(t)
	for _, name := range []string{
		"web%2Cowner%3Dhelm", // web,owner=helm  (comma + equals)
		"web%3Dx",            // web=x
		"in%28a%29",          // in(a)
		"a%21b",              // a!b
		"a%20b",              // a b (space)
	} {
		target := "/api/helm/releases/detail?namespace=prod&name=" + name
		rec := doReq(t, h, "GET", target)
		if rec.Code != http.StatusBadRequest {
			t.Errorf("name=%q: want 400 (selector-meta rejected), got %d", name, rec.Code)
		}
	}
}

func TestDecodeRobustnessSkipsBadSecret(t *testing.T) {
	good := releaseSecret(t, "prod", "web", 1, "deployed", encodeRelease(t, sampleRelease("web", "prod", 1, "deployed")))
	bad := releaseSecret(t, "prod", "broken", 1, "deployed", []byte("this-is-not-base64-gzip!!!"))
	h := newHandler(t, good, bad)

	rec := doReq(t, h, "GET", "/api/helm/releases")
	if rec.Code != 200 {
		t.Fatalf("code %d: %s", rec.Code, rec.Body.String())
	}
	var got []Release
	_ = json.Unmarshal(rec.Body.Bytes(), &got)
	if len(got) != 1 || got[0].Name != "web" {
		t.Fatalf("bad secret should be skipped; got %+v", got)
	}
}

func TestDecodeRawGzipFallback(t *testing.T) {
	// A payload that is raw gzip (not base64-wrapped) should still decode.
	raw, _ := json.Marshal(sampleRelease("web", "prod", 1, "deployed"))
	var buf bytes.Buffer
	zw := gzip.NewWriter(&buf)
	_, _ = zw.Write(raw)
	_ = zw.Close()
	rel, err := decodeReleaseSecret(buf.Bytes())
	if err != nil {
		t.Fatalf("raw gzip should decode: %v", err)
	}
	if rel.Name != "web" {
		t.Fatalf("got %q", rel.Name)
	}
}

func TestNoTypedClientReturnsEmpty(t *testing.T) {
	// Accessor with a nil clientset (DefaultDeps / --mock) ⇒ empty list, no panic.
	acc := k8s.NewAccessorFromAll(nil, nil, nil)
	h := NewHandler(acc, Config{})
	rec := doReq(t, h, "GET", "/api/helm/releases")
	if rec.Code != 200 {
		t.Fatalf("want 200, got %d", rec.Code)
	}
	var got []Release
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	if len(got) != 0 {
		t.Fatalf("want empty, got %+v", got)
	}
}

func TestUnknownSubpath(t *testing.T) {
	h := newHandler(t)
	rec := doReq(t, h, "GET", "/api/helm/bogus")
	if rec.Code != http.StatusNotFound {
		t.Fatalf("want 404, got %d", rec.Code)
	}
}

// ---- chart repos ----------------------------------------------------------

const sampleIndex = `apiVersion: v1
entries:
  nginx:
    - name: nginx
      version: 2.1.0
      description: Nginx web server
    - name: nginx
      version: 2.0.0
      description: Older nginx
  redis:
    - name: redis
      version: 5.0.1
      description: Redis key-value store
generated: "2024-01-01T00:00:00Z"
`

func TestListReposAndCharts(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/index.yaml" {
			http.Error(w, "not found", 404)
			return
		}
		_, _ = w.Write([]byte(sampleIndex))
	}))
	defer srv.Close()

	acc := k8s.NewAccessorFromAll(nil, nil, nil)
	h := NewHandler(acc, Config{Repos: []ChartRepo{{Name: "main", URL: srv.URL}}})

	// listRepos
	rec := doReq(t, h, "GET", "/api/helm/repos")
	if rec.Code != 200 {
		t.Fatalf("repos code %d", rec.Code)
	}
	var repos []ChartRepo
	_ = json.Unmarshal(rec.Body.Bytes(), &repos)
	if len(repos) != 1 || repos[0].Name != "main" || repos[0].URL != srv.URL {
		t.Fatalf("repos mismatch: %+v", repos)
	}

	// listCharts — latest per entry, sorted by name.
	rec = doReq(t, h, "GET", "/api/helm/charts?repo=main")
	if rec.Code != 200 {
		t.Fatalf("charts code %d: %s", rec.Code, rec.Body.String())
	}
	var charts []Chart
	_ = json.Unmarshal(rec.Body.Bytes(), &charts)
	if len(charts) != 2 {
		t.Fatalf("want 2 charts, got %d: %+v", len(charts), charts)
	}
	if charts[0] != (Chart{Name: "nginx", Version: "2.1.0", Description: "Nginx web server"}) {
		t.Fatalf("nginx chart mismatch: %+v", charts[0])
	}
	if charts[1] != (Chart{Name: "redis", Version: "5.0.1", Description: "Redis key-value store"}) {
		t.Fatalf("redis chart mismatch: %+v", charts[1])
	}
}

func TestListChartsUnknownRepo(t *testing.T) {
	h := NewHandler(k8s.NewAccessorFromAll(nil, nil, nil), Config{Repos: []ChartRepo{{Name: "main", URL: "http://x"}}})
	rec := doReq(t, h, "GET", "/api/helm/charts?repo=nope")
	if rec.Code != http.StatusNotFound {
		t.Fatalf("want 404, got %d", rec.Code)
	}
	assertErrorBody(t, rec)
}

func TestListChartsNoReposConfigured(t *testing.T) {
	h := NewHandler(k8s.NewAccessorFromAll(nil, nil, nil), Config{})
	// listRepos empty
	rec := doReq(t, h, "GET", "/api/helm/repos")
	var repos []ChartRepo
	if err := json.Unmarshal(rec.Body.Bytes(), &repos); err != nil {
		t.Fatal(err)
	}
	if len(repos) != 0 {
		t.Fatalf("want no repos, got %+v", repos)
	}
	// listCharts ⇒ 404 unknown repo
	rec = doReq(t, h, "GET", "/api/helm/charts?repo=main")
	if rec.Code != http.StatusNotFound {
		t.Fatalf("want 404, got %d", rec.Code)
	}
}

func TestListChartsFetchError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, "boom", http.StatusInternalServerError)
	}))
	defer srv.Close()
	h := NewHandler(k8s.NewAccessorFromAll(nil, nil, nil), Config{Repos: []ChartRepo{{Name: "main", URL: srv.URL}}})
	rec := doReq(t, h, "GET", "/api/helm/charts?repo=main")
	if rec.Code != http.StatusBadGateway {
		t.Fatalf("want 502, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestMethodNotAllowed(t *testing.T) {
	h := newHandler(t)
	rec := doReq(t, h, "POST", "/api/helm/releases")
	if rec.Code != http.StatusMethodNotAllowed {
		t.Fatalf("want 405, got %d", rec.Code)
	}
}

func assertErrorBody(t *testing.T, rec *httptest.ResponseRecorder) {
	t.Helper()
	var body map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("error body not JSON: %v", err)
	}
	for _, k := range []string{"error", "code", "reason"} {
		if _, ok := body[k]; !ok {
			t.Errorf("error body missing %q: %v", k, body)
		}
	}
}
