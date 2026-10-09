package servicemap

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	discfake "k8s.io/client-go/discovery/fake"
	dynfake "k8s.io/client-go/dynamic/fake"
	kubefake "k8s.io/client-go/kubernetes/fake"

	"github.com/aimemalaika/Kestrel/internal/auth"
	"github.com/aimemalaika/Kestrel/internal/k8s"
)

// handlerWithFake returns a handler backed by a fake clientset, and the clientset
// itself (so a test can assert the written ConfigMap). An empty-token context is
// used so UserClientset returns the fake's SA client.
func handlerWithFake(ns, name string) (*Handler, *kubefake.Clientset) {
	kube := kubefake.NewSimpleClientset()
	acc := k8s.NewAccessorFromAll(dynfake.NewSimpleDynamicClient(runtime.NewScheme()), &discfake.FakeDiscovery{}, kube)
	return NewHandler(acc, Config{Namespace: ns, Name: name}), kube
}

func do(t *testing.T, h http.Handler, method, body string) *httptest.ResponseRecorder {
	t.Helper()
	var rd io.Reader
	if body != "" {
		rd = strings.NewReader(body)
	}
	req := httptest.NewRequest(method, "/api/servicemap", rd)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

// TestTokenUserClientBuildFailureFailsClosed is the fail-open guard: a
// token-bearing request whose per-user client cannot be built (no rest.Config)
// must return 500 — NOT silently fall back to the in-memory store (which would
// let a user without RBAC write shared state as nobody).
func TestTokenUserClientBuildFailureFailsClosed(t *testing.T) {
	// Accessor with a typed clientset but NO rest.Config, so UserClientset errors
	// when a token is present.
	acc := k8s.NewAccessorFromAll(nil, nil, kubefake.NewSimpleClientset())
	h := NewHandler(acc, Config{Namespace: "ns", Name: "cm"})

	body := "apiVersion: kestrel.dev/v1\nkind: ServiceMap\nservices:\n  - id: a\n    slo: 99.9\n"
	ctx := auth.WithIdentity(context.Background(), auth.Identity{User: "alice", Token: "tok"})
	req := httptest.NewRequest(http.MethodPut, "/api/servicemap", strings.NewReader(body)).WithContext(ctx)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("token-bearing PUT with unbuildable client: want 500, got %d (%s)", rec.Code, rec.Body.String())
	}
	if h.mem != nil {
		t.Fatal("fail-open: a token-bearing PUT must NOT write the in-memory fallback store")
	}
}

func decodeModel(t *testing.T, rec *httptest.ResponseRecorder) Model {
	t.Helper()
	var m Model
	if err := json.Unmarshal(rec.Body.Bytes(), &m); err != nil {
		t.Fatalf("body not a Model: %v\n%s", err, rec.Body.String())
	}
	return m
}

func decodeErrors(t *testing.T, rec *httptest.ResponseRecorder) (map[string]any, []ValidationError) {
	t.Helper()
	var env struct {
		Error  string            `json:"error"`
		Code   int               `json:"code"`
		Reason string            `json:"reason"`
		Errors []ValidationError `json:"errors"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &env); err != nil {
		t.Fatalf("body not a validation-error envelope: %v\n%s", err, rec.Body.String())
	}
	return map[string]any{"error": env.Error, "code": env.Code, "reason": env.Reason}, env.Errors
}

const validMap = `
apiVersion: kestrel.dev/v1
kind: ServiceMap
metadata:
  name: shop
services:
  - id: web
    displayName: Web Frontend
    slo: 99.9
    workload:
      namespace: prod
      kind: Deployment
      name: web
    dependsOn:
      - id: api
        protocol: http
      - id: cache
        critical: false
  - id: api
    slo: 99
    workload:
      namespace: prod
      selector:
        app: api
  - id: cache
    slo: 95
`

// ---- valid PUT: 200 + parsed model + ConfigMap written ----------------------

func TestPutValidReturnsModelAndWritesConfigMap(t *testing.T) {
	h, kube := handlerWithFake("kestrel-system", "kestrel-servicemap")
	rec := do(t, h, http.MethodPut, validMap)
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d: %s", rec.Code, rec.Body.String())
	}
	m := decodeModel(t, rec)
	if m.Name != "shop" {
		t.Errorf("name = %q, want shop (metadata.name)", m.Name)
	}
	if len(m.Services) != 3 {
		t.Fatalf("want 3 services, got %d", len(m.Services))
	}
	web := m.Services[0]
	if web.DisplayName != "Web Frontend" {
		t.Errorf("displayName = %q", web.DisplayName)
	}
	if web.Workload == nil || web.Workload.Name != "web" || web.Workload.Namespace != "prod" {
		t.Errorf("web workload = %+v", web.Workload)
	}
	if len(web.DependsOn) != 2 {
		t.Fatalf("web deps = %d", len(web.DependsOn))
	}
	// critical defaults to true (api), explicit false survives (cache).
	if !web.DependsOn[0].Critical {
		t.Errorf("dep api critical should default true")
	}
	if web.DependsOn[1].Critical {
		t.Errorf("dep cache critical should be false")
	}
	// api: selector workload with default displayName (= id).
	api := m.Services[1]
	if api.DisplayName != "api" {
		t.Errorf("api displayName should default to id, got %q", api.DisplayName)
	}
	if api.Workload == nil || api.Workload.Selector["app"] != "api" {
		t.Errorf("api workload selector = %+v", api.Workload)
	}

	// ConfigMap written with the raw YAML under services.yaml.
	cm, err := kube.CoreV1().ConfigMaps("kestrel-system").Get(context.Background(), "kestrel-servicemap", metav1.GetOptions{})
	if err != nil {
		t.Fatalf("configmap not written: %v", err)
	}
	if got := cm.Data[dataKey]; !strings.Contains(got, "kestrel.dev/v1") {
		t.Errorf("stored YAML missing original content: %q", got)
	}
}

// PUT when the ConfigMap already exists must update it (not fail on create).
func TestPutUpdatesExistingConfigMap(t *testing.T) {
	h, kube := handlerWithFake("ns", "cm")
	_, err := kube.CoreV1().ConfigMaps("ns").Create(context.Background(), &corev1.ConfigMap{
		ObjectMeta: metav1.ObjectMeta{Name: "cm", Namespace: "ns"},
		Data:       map[string]string{dataKey: "stale", "other": "keep"},
	}, metav1.CreateOptions{})
	if err != nil {
		t.Fatal(err)
	}
	if rec := do(t, h, http.MethodPut, validMap); rec.Code != http.StatusOK {
		t.Fatalf("status %d: %s", rec.Code, rec.Body.String())
	}
	cm, _ := kube.CoreV1().ConfigMaps("ns").Get(context.Background(), "cm", metav1.GetOptions{})
	if !strings.Contains(cm.Data[dataKey], "kestrel.dev/v1") {
		t.Errorf("services.yaml not updated: %q", cm.Data[dataKey])
	}
	if cm.Data["other"] != "keep" {
		t.Errorf("update clobbered unrelated keys: %v", cm.Data)
	}
}

// ---- validation error classes: 422 + the right errors[] entry ---------------

func TestValidationErrorClasses(t *testing.T) {
	cases := []struct {
		name string
		yaml string
		want string // substring expected in at least one error message
	}{
		{"wrong apiVersion", "apiVersion: other\nkind: ServiceMap\nservices: []", "apiVersion"},
		{"wrong kind", "apiVersion: kestrel.dev/v1\nkind: Other\nservices: []", "kind"},
		{"services not list", "apiVersion: kestrel.dev/v1\nkind: ServiceMap\nservices: {}", "services must be a list"},
		{"missing id", "apiVersion: kestrel.dev/v1\nkind: ServiceMap\nservices:\n  - slo: 99", `missing a required "id"`},
		{"duplicate id", "apiVersion: kestrel.dev/v1\nkind: ServiceMap\nservices:\n  - id: a\n    slo: 99\n  - id: a\n    slo: 99", "Duplicate service id"},
		{"slo zero", "apiVersion: kestrel.dev/v1\nkind: ServiceMap\nservices:\n  - id: a\n    slo: 0", "slo must be a number"},
		{"slo over 100", "apiVersion: kestrel.dev/v1\nkind: ServiceMap\nservices:\n  - id: a\n    slo: 101", "slo must be a number"},
		{"slo not number", "apiVersion: kestrel.dev/v1\nkind: ServiceMap\nservices:\n  - id: a\n    slo: nope", "slo must be a number"},
		{"workload both name+selector", "apiVersion: kestrel.dev/v1\nkind: ServiceMap\nservices:\n  - id: a\n    slo: 99\n    workload:\n      namespace: ns\n      kind: Deployment\n      name: a\n      selector:\n        app: a", "workload must be"},
		{"workload missing namespace", "apiVersion: kestrel.dev/v1\nkind: ServiceMap\nservices:\n  - id: a\n    slo: 99\n    workload:\n      kind: Deployment\n      name: a", "workload requires a namespace"},
		{"dangling dependsOn", "apiVersion: kestrel.dev/v1\nkind: ServiceMap\nservices:\n  - id: a\n    slo: 99\n    dependsOn:\n      - id: ghost", "undeclared service"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			h, _ := handlerWithFake("ns", "cm")
			rec := do(t, h, http.MethodPut, c.yaml)
			if rec.Code != http.StatusUnprocessableEntity {
				t.Fatalf("status %d want 422: %s", rec.Code, rec.Body.String())
			}
			env, errs := decodeErrors(t, rec)
			if env["reason"] != "Invalid" || int(env["code"].(int)) != 422 {
				t.Errorf("envelope = %v", env)
			}
			if len(errs) == 0 {
				t.Fatal("no errors[] in body")
			}
			found := false
			for _, e := range errs {
				if strings.Contains(e.Message, c.want) {
					found = true
				}
			}
			if !found {
				t.Errorf("no error containing %q; got %+v", c.want, errs)
			}
		})
	}
}

// Dependency cycle must be reported as a cycle error.
func TestValidationCycle(t *testing.T) {
	cyclic := "apiVersion: kestrel.dev/v1\nkind: ServiceMap\nservices:\n" +
		"  - id: a\n    slo: 99\n    dependsOn:\n      - id: b\n" +
		"  - id: b\n    slo: 99\n    dependsOn:\n      - id: a\n"
	h, _ := handlerWithFake("ns", "cm")
	rec := do(t, h, http.MethodPut, cyclic)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("status %d want 422: %s", rec.Code, rec.Body.String())
	}
	_, errs := decodeErrors(t, rec)
	found := false
	for _, e := range errs {
		if strings.Contains(e.Message, "Dependency cycle") {
			found = true
			if len(e.Edge) != 2 {
				t.Errorf("cycle error should carry an edge, got %+v", e)
			}
		}
	}
	if !found {
		t.Errorf("no cycle error; got %+v", errs)
	}
}

// ---- malformed YAML → 400 ---------------------------------------------------

func TestPutMalformedYAML(t *testing.T) {
	h, _ := handlerWithFake("ns", "cm")
	rec := do(t, h, http.MethodPut, "{ unclosed: [1, 2, 3")
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status %d want 400: %s", rec.Code, rec.Body.String())
	}
	var env map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &env); err != nil {
		t.Fatalf("body not JSON: %v", err)
	}
	if env["reason"] != "BadRequest" {
		t.Errorf("reason = %v want BadRequest", env["reason"])
	}
}

// ---- GET: empty when nothing stored; round-trips after PUT ------------------

func TestGetEmptyWhenNothingStored(t *testing.T) {
	h, _ := handlerWithFake("ns", "cm")
	rec := do(t, h, http.MethodGet, "")
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d", rec.Code)
	}
	m := decodeModel(t, rec)
	if m.Name != "" || len(m.Services) != 0 {
		t.Errorf("empty GET = %+v, want {name:\"\",services:[]}", m)
	}
	// services must serialize as [] not null.
	if !strings.Contains(rec.Body.String(), `"services":[]`) {
		t.Errorf("services should be [] in JSON: %s", rec.Body.String())
	}
}

func TestGetRoundTripsAfterPut(t *testing.T) {
	h, _ := handlerWithFake("ns", "cm")
	if rec := do(t, h, http.MethodPut, validMap); rec.Code != http.StatusOK {
		t.Fatalf("PUT status %d", rec.Code)
	}
	rec := do(t, h, http.MethodGet, "")
	if rec.Code != http.StatusOK {
		t.Fatalf("GET status %d", rec.Code)
	}
	m := decodeModel(t, rec)
	if m.Name != "shop" || len(m.Services) != 3 {
		t.Errorf("round-trip model = %+v", m)
	}
}

// ---- oversize body → 413 ----------------------------------------------------

func TestPutOversizeBody(t *testing.T) {
	h, _ := handlerWithFake("ns", "cm")
	big := "apiVersion: kestrel.dev/v1\nkind: ServiceMap\nservices: []\n# " + strings.Repeat("x", maxBody+1024)
	rec := do(t, h, http.MethodPut, big)
	if rec.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("status %d want 413: %s", rec.Code, rec.Body.String())
	}
}

// ---- in-memory fallback (nil clientset): PUT then GET round-trips -----------

func TestInMemoryFallback(t *testing.T) {
	// NewAccessorFromAll(nil,nil,nil) + empty-token ctx ⇒ UserClientset returns nil.
	acc := k8s.NewAccessorFromAll(nil, nil, nil)
	h := NewHandler(acc, Config{})
	if rec := do(t, h, http.MethodPut, validMap); rec.Code != http.StatusOK {
		t.Fatalf("PUT (mem) status %d: %s", rec.Code, rec.Body.String())
	}
	rec := do(t, h, http.MethodGet, "")
	if rec.Code != http.StatusOK {
		t.Fatalf("GET (mem) status %d", rec.Code)
	}
	if m := decodeModel(t, rec); m.Name != "shop" || len(m.Services) != 3 {
		t.Errorf("in-memory round-trip = %+v", m)
	}
}

// ---- 405 on other methods ---------------------------------------------------

func TestMethodNotAllowed(t *testing.T) {
	h, _ := handlerWithFake("ns", "cm")
	for _, method := range []string{http.MethodPost, http.MethodDelete} {
		rec := do(t, h, method, "")
		if rec.Code != http.StatusMethodNotAllowed {
			t.Errorf("%s: status %d want 405", method, rec.Code)
		}
		if allow := rec.Header().Get("Allow"); allow != "GET, PUT" {
			t.Errorf("%s: Allow = %q want \"GET, PUT\"", method, allow)
		}
	}
}
