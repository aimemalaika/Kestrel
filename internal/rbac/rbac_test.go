package rbac

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	authzv1 "k8s.io/api/authorization/v1"
	rbacv1 "k8s.io/api/rbac/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/kubernetes/fake"
	ktesting "k8s.io/client-go/testing"

	"github.com/aimemalaika/Kestrel/internal/auth"
	"github.com/aimemalaika/Kestrel/internal/k8s"
)

const subj = "system:serviceaccount:prod:api"

func seeded() *fake.Clientset {
	sa := []rbacv1.Subject{{Kind: "ServiceAccount", Name: "api", Namespace: "prod"}}
	cs := fake.NewSimpleClientset(
		&rbacv1.Role{ObjectMeta: metav1.ObjectMeta{Name: "podreader", Namespace: "prod"},
			Rules: []rbacv1.PolicyRule{{APIGroups: []string{""}, Resources: []string{"pods"}, Verbs: []string{"get", "list"}}}},
		&rbacv1.RoleBinding{ObjectMeta: metav1.ObjectMeta{Name: "deployers", Namespace: "prod"},
			Subjects: sa, RoleRef: rbacv1.RoleRef{Kind: "Role", Name: "podreader"}},
		&rbacv1.ClusterRole{ObjectMeta: metav1.ObjectMeta{Name: "cfg"},
			Rules: []rbacv1.PolicyRule{{APIGroups: []string{""}, Resources: []string{"configmaps"}, Verbs: []string{"*"}}}},
		&rbacv1.ClusterRoleBinding{ObjectMeta: metav1.ObjectMeta{Name: "cfgbind"},
			Subjects: sa, RoleRef: rbacv1.RoleRef{Kind: "ClusterRole", Name: "cfg"}},
	)
	// SAR reactor: allow exactly what the seeded rules grant.
	cs.PrependReactor("create", "subjectaccessreviews", func(a ktesting.Action) (bool, runtime.Object, error) {
		sar := a.(ktesting.CreateAction).GetObject().(*authzv1.SubjectAccessReview)
		ra := sar.Spec.ResourceAttributes
		allowed := sar.Spec.User == subj && ((ra.Resource == "pods" && (ra.Verb == "get" || ra.Verb == "list")) || ra.Resource == "configmaps")
		sar.Status.Allowed = allowed
		return true, sar, nil
	})
	return cs
}

func serve(t *testing.T, cs *fake.Clientset, ctx context.Context, url string) *httptest.ResponseRecorder {
	t.Helper()
	var acc k8s.ClusterAccessor
	if cs == nil {
		acc = k8s.NewAccessorFromAll(nil, nil, nil)
	} else {
		acc = k8s.NewAccessorFromAll(nil, nil, cs)
	}
	req := httptest.NewRequest(http.MethodGet, url, nil).WithContext(ctx)
	rec := httptest.NewRecorder()
	NewHandler(acc).ServeHTTP(rec, req)
	return rec
}

func opCtx() context.Context {
	return auth.WithIdentity(context.Background(), auth.Identity{User: auth.Operator})
}

func TestAccessMatrix(t *testing.T) {
	rec := serve(t, seeded(), opCtx(), "/api/rbac/access?kind=ServiceAccount&namespace=prod&name=api")
	if rec.Code != 200 {
		t.Fatalf("code=%d body=%s", rec.Code, rec.Body)
	}
	var m Matrix
	if err := json.Unmarshal(rec.Body.Bytes(), &m); err != nil {
		t.Fatal(err)
	}
	if m.Subject != subj {
		t.Fatalf("subject=%q", m.Subject)
	}
	byRes := map[string]ResourceAccess{}
	for _, r := range flat(m) {
		byRes[r.Resource] = r
		if len(r.Verbs) != 8 {
			t.Fatalf("%s has %d verbs", r.Resource, len(r.Verbs))
		}
	}
	pods := byRes["pods"]
	if c := pods.Verbs["get"]; !c.Allowed || c.Binding != "RO:deployers/podreader" {
		t.Fatalf("pods get=%+v", c)
	}
	if c := pods.Verbs["list"]; !c.Allowed {
		t.Fatalf("pods list=%+v", c)
	}
	if c := pods.Verbs["delete"]; c.Allowed || c.Binding != "" {
		t.Fatalf("pods delete=%+v", c)
	}
	if c := byRes["configmaps"].Verbs["deletecollection"]; !c.Allowed || c.Binding != "CR:cfgbind/cfg" {
		t.Fatalf("configmaps deletecollection=%+v", c)
	}
}

func TestNoClientEmpty(t *testing.T) {
	rec := serve(t, nil, opCtx(), "/api/rbac/access?kind=ServiceAccount&namespace=prod&name=api")
	if rec.Code != 200 {
		t.Fatalf("code=%d", rec.Code)
	}
	var m Matrix
	_ = json.Unmarshal(rec.Body.Bytes(), &m)
	if m.Scopes == nil || len(m.Scopes) != 0 {
		t.Fatalf("scopes=%v", m.Scopes)
	}
}

func TestForbiddenSAR(t *testing.T) {
	cs := seeded()
	cs.PrependReactor("create", "subjectaccessreviews", func(ktesting.Action) (bool, runtime.Object, error) {
		return true, nil, apierrors.NewForbidden(schema.GroupResource{Group: "authorization.k8s.io", Resource: "subjectaccessreviews"}, "", nil)
	})
	rec := serve(t, cs, opCtx(), "/api/rbac/access?kind=ServiceAccount&namespace=prod&name=api")
	if rec.Code != http.StatusForbidden {
		t.Fatalf("code=%d body=%s", rec.Code, rec.Body)
	}
}

func TestForbiddenRBACList(t *testing.T) {
	cs := seeded()
	cs.PrependReactor("list", "rolebindings", func(ktesting.Action) (bool, runtime.Object, error) {
		return true, nil, apierrors.NewForbidden(schema.GroupResource{Group: "rbac.authorization.k8s.io", Resource: "rolebindings"}, "", nil)
	})
	rec := serve(t, cs, opCtx(), "/api/rbac/access?kind=ServiceAccount&namespace=prod&name=api")
	if rec.Code != http.StatusForbidden {
		t.Fatalf("code=%d", rec.Code)
	}
}

func TestValidationAndRouting(t *testing.T) {
	for url, want := range map[string]int{
		"/api/rbac/access": 400,
		"/api/rbac/access?kind=ServiceAccount&namespace=a/b&name=x": 400,
		"/api/rbac/nope": 404,
	} {
		if rec := serve(t, seeded(), opCtx(), url); rec.Code != want {
			t.Fatalf("%s: code=%d want %d", url, rec.Code, want)
		}
	}
	req := httptest.NewRequest(http.MethodPost, "/api/rbac/access?kind=ServiceAccount&namespace=a&name=b", nil)
	rec := httptest.NewRecorder()
	NewHandler(k8s.NewAccessorFromAll(nil, nil, nil)).ServeHTTP(rec, req)
	if rec.Code != 405 {
		t.Fatalf("post code=%d", rec.Code)
	}
}

func TestWildcardExpansionCapped(t *testing.T) {
	got := expand("*", "*")
	if len(got) != len(commonResources) || len(got) > maxResources {
		t.Fatalf("expand=%d", len(got))
	}
	if g := expand("apps", "*"); len(g) != 4 {
		t.Fatalf("apps expand=%v", g)
	}
	if v := expandVerb("*"); len(v) != 8 {
		t.Fatalf("verbs=%v", v)
	}
}

// subjSeed seeds a User (RoleBinding in ns "dev" and "stage") and a Group
// (ClusterRoleBinding), capturing every SAR spec.
func subjSeed(sars *[]authzv1.SubjectAccessReviewSpec) *fake.Clientset {
	cs := fake.NewSimpleClientset(
		&rbacv1.Role{ObjectMeta: metav1.ObjectMeta{Name: "podreader", Namespace: "dev"},
			Rules: []rbacv1.PolicyRule{{APIGroups: []string{""}, Resources: []string{"pods"}, Verbs: []string{"get", "list"}}}},
		&rbacv1.RoleBinding{ObjectMeta: metav1.ObjectMeta{Name: "alice-pods", Namespace: "dev"},
			Subjects: []rbacv1.Subject{{Kind: "User", Name: "alice"}}, RoleRef: rbacv1.RoleRef{Kind: "Role", Name: "podreader"}},
		&rbacv1.ClusterRole{ObjectMeta: metav1.ObjectMeta{Name: "cfg"},
			Rules: []rbacv1.PolicyRule{{APIGroups: []string{""}, Resources: []string{"configmaps"}, Verbs: []string{"get"}}}},
		&rbacv1.RoleBinding{ObjectMeta: metav1.ObjectMeta{Name: "alice-cfg", Namespace: "stage"},
			Subjects: []rbacv1.Subject{{Kind: "User", Name: "alice"}}, RoleRef: rbacv1.RoleRef{Kind: "ClusterRole", Name: "cfg"}},
		&rbacv1.ClusterRoleBinding{ObjectMeta: metav1.ObjectMeta{Name: "admins"},
			Subjects: []rbacv1.Subject{{Kind: "Group", Name: "platform-admins"}}, RoleRef: rbacv1.RoleRef{Kind: "ClusterRole", Name: "cfg"}},
	)
	var mu sync.Mutex
	cs.PrependReactor("create", "subjectaccessreviews", func(a ktesting.Action) (bool, runtime.Object, error) {
		sar := a.(ktesting.CreateAction).GetObject().(*authzv1.SubjectAccessReview)
		ra := sar.Spec.ResourceAttributes
		mu.Lock()
		*sars = append(*sars, sar.Spec)
		mu.Unlock()
		user := sar.Spec.User == "alice" &&
			((ra.Resource == "pods" && ra.Namespace == "dev") || (ra.Resource == "configmaps" && ra.Namespace == "stage"))
		group := len(sar.Spec.Groups) == 1 && sar.Spec.Groups[0] == "platform-admins" && ra.Resource == "configmaps"
		sar.Status.Allowed = user || group
		return true, sar, nil
	})
	return cs
}

func decode(t *testing.T, rec *httptest.ResponseRecorder) Matrix {
	t.Helper()
	if rec.Code != 200 {
		t.Fatalf("code=%d body=%s", rec.Code, rec.Body)
	}
	var m Matrix
	if err := json.Unmarshal(rec.Body.Bytes(), &m); err != nil {
		t.Fatal(err)
	}
	return m
}

func TestUserSubjectAcrossNamespaces(t *testing.T) {
	var sars []authzv1.SubjectAccessReviewSpec
	m := decode(t, serve(t, subjSeed(&sars), opCtx(), "/api/rbac/access?kind=User&name=alice"))
	if m.Subject != "alice" {
		t.Fatalf("subject=%q", m.Subject)
	}
	by := map[string]ResourceAccess{}
	for _, r := range flat(m) {
		by[r.Resource] = r
	}
	if c := by["pods"].Verbs["get"]; !c.Allowed || c.Binding != "RO:alice-pods/podreader" {
		t.Fatalf("pods get=%+v", c)
	}
	if c := by["configmaps"].Verbs["get"]; !c.Allowed || c.Binding != "RO:alice-cfg/cfg" {
		t.Fatalf("configmaps get (stage binding)=%+v", c)
	}
	if len(sars) == 0 {
		t.Fatal("no SARs captured")
	}
	for _, s := range sars {
		if s.User != "alice" || len(s.Groups) != 0 {
			t.Fatalf("spec=%+v", s)
		}
	}
}

func TestGroupSubject(t *testing.T) {
	var sars []authzv1.SubjectAccessReviewSpec
	m := decode(t, serve(t, subjSeed(&sars), opCtx(), "/api/rbac/access?kind=Group&name=platform-admins&namespace=ignored"))
	rs := flat(m)
	if len(rs) != 1 || rs[0].Resource != "configmaps" {
		t.Fatalf("resources=%+v", rs)
	}
	if c := rs[0].Verbs["get"]; !c.Allowed || c.Binding != "CR:admins/cfg" {
		t.Fatalf("get=%+v", c)
	}
	for _, s := range sars {
		if s.User != "" || len(s.Groups) != 1 || s.Groups[0] != "platform-admins" {
			t.Fatalf("spec=%+v", s)
		}
	}
}

func TestSubjectValidationAndEmpty(t *testing.T) {
	var sars []authzv1.SubjectAccessReviewSpec
	for url, want := range map[string]int{
		"/api/rbac/access?name=alice":                     400,
		"/api/rbac/access?kind=Robot&name=alice":          400,
		"/api/rbac/access?kind=User":                      400,
		"/api/rbac/access?kind=ServiceAccount&name=x":     400,
		"/api/rbac/access?kind=Group&name=system:masters": 200,
	} {
		if rec := serve(t, subjSeed(&sars), opCtx(), url); rec.Code != want {
			t.Fatalf("%s: code=%d want %d", url, rec.Code, want)
		}
	}
	m := decode(t, serve(t, nil, opCtx(), "/api/rbac/access?kind=User&name=alice"))
	if m.Scopes == nil || len(m.Scopes) != 0 {
		t.Fatalf("scopes=%v", m.Scopes)
	}
}

func TestUserForbiddenSAR(t *testing.T) {
	var sars []authzv1.SubjectAccessReviewSpec
	cs := subjSeed(&sars)
	cs.PrependReactor("create", "subjectaccessreviews", func(ktesting.Action) (bool, runtime.Object, error) {
		return true, nil, apierrors.NewForbidden(schema.GroupResource{Group: "authorization.k8s.io", Resource: "subjectaccessreviews"}, "", nil)
	})
	if rec := serve(t, cs, opCtx(), "/api/rbac/access?kind=User&name=alice"); rec.Code != http.StatusForbidden {
		t.Fatalf("code=%d", rec.Code)
	}
}

// TestServiceAccountScopesByNamespace: an SA bound in ns-a (RoleBinding), ns-b
// (RoleBinding) and cluster-wide (ClusterRoleBinding) yields one scope each,
// cluster-wide first, with no cross-namespace leakage.
func TestServiceAccountScopesByNamespace(t *testing.T) {
	sa := []rbacv1.Subject{{Kind: "ServiceAccount", Name: "build", Namespace: "default"}}
	rule := func(res string, verbs ...string) []rbacv1.PolicyRule {
		return []rbacv1.PolicyRule{{APIGroups: []string{""}, Resources: []string{res}, Verbs: verbs}}
	}
	cs := fake.NewSimpleClientset(
		&rbacv1.Role{ObjectMeta: metav1.ObjectMeta{Name: "pr", Namespace: "ns-a"}, Rules: rule("pods", "get")},
		&rbacv1.RoleBinding{ObjectMeta: metav1.ObjectMeta{Name: "a-bind", Namespace: "ns-a"},
			Subjects: sa, RoleRef: rbacv1.RoleRef{Kind: "Role", Name: "pr"}},
		&rbacv1.Role{ObjectMeta: metav1.ObjectMeta{Name: "pr", Namespace: "ns-b"}, Rules: rule("pods", "get")},
		&rbacv1.RoleBinding{ObjectMeta: metav1.ObjectMeta{Name: "b-bind", Namespace: "ns-b"},
			Subjects: sa, RoleRef: rbacv1.RoleRef{Kind: "Role", Name: "pr"}},
		&rbacv1.ClusterRole{ObjectMeta: metav1.ObjectMeta{Name: "nodes"}, Rules: rule("nodes", "list")},
		&rbacv1.ClusterRoleBinding{ObjectMeta: metav1.ObjectMeta{Name: "nodes-bind"},
			Subjects: sa, RoleRef: rbacv1.RoleRef{Kind: "ClusterRole", Name: "nodes"}},
	)
	cs.PrependReactor("create", "subjectaccessreviews", func(a ktesting.Action) (bool, runtime.Object, error) {
		sar := a.(ktesting.CreateAction).GetObject().(*authzv1.SubjectAccessReview)
		ra := sar.Spec.ResourceAttributes
		sar.Status.Allowed = (ra.Resource == "pods" && ra.Verb == "get" && ra.Namespace == "ns-a") ||
			(ra.Resource == "nodes" && ra.Verb == "list" && ra.Namespace == "")
		return true, sar, nil
	})
	m := decode(t, serve(t, cs, opCtx(), "/api/rbac/access?kind=ServiceAccount&namespace=default&name=build"))
	var order []string
	by := map[string]map[string]ResourceAccess{}
	for _, s := range m.Scopes {
		order = append(order, s.Namespace)
		by[s.Namespace] = map[string]ResourceAccess{}
		for _, r := range s.Resources {
			by[s.Namespace][r.Resource] = r
		}
	}
	if len(order) != 3 || order[0] != "" || order[1] != "ns-a" || order[2] != "ns-b" {
		t.Fatalf("scope order=%q", order)
	}
	if c := by[""]["nodes"].Verbs["list"]; !c.Allowed || c.Binding != "CR:nodes-bind/nodes" {
		t.Fatalf("cluster nodes list=%+v", c)
	}
	if c := by["ns-a"]["pods"].Verbs["get"]; !c.Allowed || c.Binding != "RO:a-bind/pr" {
		t.Fatalf("ns-a pods get=%+v", c)
	}
	if _, ok := by["ns-b"]["pods"]; !ok {
		t.Fatalf("ns-b pods row missing: %+v", by["ns-b"])
	}
	if c := by["ns-b"]["pods"].Verbs["get"]; c.Allowed {
		t.Fatalf("ns-b pods get leaked allowed: %+v", c)
	}
	for _, s := range m.Scopes {
		if len(s.Resources) != 1 {
			t.Fatalf("scope %q has %d rows, want 1", s.Namespace, len(s.Resources))
		}
	}
}

// flat merges allowed cells across scopes per resource (test helper for
// scope-agnostic assertions).
func flat(m Matrix) []ResourceAccess {
	idx := map[string]int{}
	var out []ResourceAccess
	for _, s := range m.Scopes {
		for _, r := range s.Resources {
			key := r.Group + "/" + r.Resource
			i, ok := idx[key]
			if !ok {
				idx[key] = len(out)
				out = append(out, ResourceAccess{Group: r.Group, Resource: r.Resource, Verbs: map[string]Cell{}})
				i = idx[key]
			}
			for v, c := range r.Verbs {
				if cur, ok := out[i].Verbs[v]; !ok || (c.Allowed && !cur.Allowed) {
					out[i].Verbs[v] = c
				}
			}
		}
	}
	return out
}

// TestCapAndTruncation seeds 3 cluster-wide + 30 (ns-a) + 30 (ns-b) = 63
// (scope, resource) pairs; the cap keeps the first 50 in sorted order.
func TestCapAndTruncation(t *testing.T) {
	sa := []rbacv1.Subject{{Kind: "ServiceAccount", Name: "big", Namespace: "default"}}
	many := func(prefix string, n int) []rbacv1.PolicyRule {
		res := make([]string, n)
		for i := range res {
			res[i] = fmt.Sprintf("%s%02d", prefix, i)
		}
		return []rbacv1.PolicyRule{{APIGroups: []string{"example.io"}, Resources: res, Verbs: []string{"get"}}}
	}
	cs := fake.NewSimpleClientset(
		&rbacv1.ClusterRole{ObjectMeta: metav1.ObjectMeta{Name: "cw"}, Rules: many("c", 3)},
		&rbacv1.ClusterRoleBinding{ObjectMeta: metav1.ObjectMeta{Name: "cw-bind"},
			Subjects: sa, RoleRef: rbacv1.RoleRef{Kind: "ClusterRole", Name: "cw"}},
		&rbacv1.Role{ObjectMeta: metav1.ObjectMeta{Name: "r", Namespace: "ns-a"}, Rules: many("a", 30)},
		&rbacv1.RoleBinding{ObjectMeta: metav1.ObjectMeta{Name: "a-bind", Namespace: "ns-a"},
			Subjects: sa, RoleRef: rbacv1.RoleRef{Kind: "Role", Name: "r"}},
		&rbacv1.Role{ObjectMeta: metav1.ObjectMeta{Name: "r", Namespace: "ns-b"}, Rules: many("b", 30)},
		&rbacv1.RoleBinding{ObjectMeta: metav1.ObjectMeta{Name: "b-bind", Namespace: "ns-b"},
			Subjects: sa, RoleRef: rbacv1.RoleRef{Kind: "Role", Name: "r"}},
	)
	cs.PrependReactor("create", "subjectaccessreviews", func(a ktesting.Action) (bool, runtime.Object, error) {
		sar := a.(ktesting.CreateAction).GetObject().(*authzv1.SubjectAccessReview)
		sar.Status.Allowed = true
		return true, sar, nil
	})
	m := decode(t, serve(t, cs, opCtx(), "/api/rbac/access?kind=ServiceAccount&namespace=default&name=big"))
	if !m.Truncated {
		t.Fatal("expected truncated=true")
	}
	counts := map[string]int{}
	total := 0
	for _, s := range m.Scopes {
		counts[s.Namespace] = len(s.Resources)
		total += len(s.Resources)
	}
	if total != maxResources {
		t.Fatalf("total pairs=%d want %d (%v)", total, maxResources, counts)
	}
	if counts[""] != 3 || counts["ns-a"] != 30 || counts["ns-b"] != 17 {
		t.Fatalf("counts=%v", counts)
	}
	if m.Scopes[0].Namespace != "" || m.Scopes[1].Namespace != "ns-a" {
		t.Fatalf("scope order wrong: %v", counts)
	}
}

func TestMatrixJSONContract(t *testing.T) {
	b, err := json.Marshal(Matrix{Subject: "x", Scopes: []NamespaceAccess{}})
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(b), `"scopes":[]`) || strings.Contains(string(b), "truncated") {
		t.Fatalf("empty matrix json=%s", b)
	}
	b, _ = json.Marshal(Matrix{Subject: "x", Truncated: true, Scopes: []NamespaceAccess{}})
	if !strings.Contains(string(b), `"truncated":true`) {
		t.Fatalf("truncated json=%s", b)
	}
}

// TestClusterScopedResourceOnlyClusterWide: a RoleBinding in ns-a granting
// `nodes` must not surface a nodes row under ns-a; it lives under "" only.
func TestClusterScopedResourceOnlyClusterWide(t *testing.T) {
	sa := []rbacv1.Subject{{Kind: "ServiceAccount", Name: "ops", Namespace: "default"}}
	rules := []rbacv1.PolicyRule{{APIGroups: []string{""}, Resources: []string{"nodes", "pods"}, Verbs: []string{"get"}}}
	cs := fake.NewSimpleClientset(
		&rbacv1.ClusterRole{ObjectMeta: metav1.ObjectMeta{Name: "nr"}, Rules: rules},
		&rbacv1.RoleBinding{ObjectMeta: metav1.ObjectMeta{Name: "a-bind", Namespace: "ns-a"},
			Subjects: sa, RoleRef: rbacv1.RoleRef{Kind: "ClusterRole", Name: "nr"}},
		&rbacv1.ClusterRoleBinding{ObjectMeta: metav1.ObjectMeta{Name: "cw-bind"},
			Subjects: sa, RoleRef: rbacv1.RoleRef{Kind: "ClusterRole", Name: "nr"}},
	)
	cs.PrependReactor("create", "subjectaccessreviews", func(a ktesting.Action) (bool, runtime.Object, error) {
		sar := a.(ktesting.CreateAction).GetObject().(*authzv1.SubjectAccessReview)
		sar.Status.Allowed = true
		return true, sar, nil
	})
	m := decode(t, serve(t, cs, opCtx(), "/api/rbac/access?kind=ServiceAccount&namespace=default&name=ops"))
	found := false
	for _, s := range m.Scopes {
		for _, r := range s.Resources {
			if r.Resource == "nodes" && s.Namespace != "" {
				t.Fatalf("nodes under namespace %q", s.Namespace)
			}
			if r.Resource == "nodes" && s.Namespace == "" && r.Verbs["get"].Allowed {
				found = true
			}
		}
	}
	if !found {
		t.Fatalf("nodes missing from cluster-wide scope: %+v", m.Scopes)
	}
	for _, r := range m.Scopes[0].Resources {
		if r.Resource == "nodes" && r.Verbs["get"].Binding != "CR:cw-bind/nr" {
			t.Fatalf("nodes binding=%q want CR:cw-bind/nr", r.Verbs["get"].Binding)
		}
	}
}

// TestClusterScopedRoleBindingOnly: only a namespaced RoleBinding references
// nodes and SAR denies it cluster-wide. Nodes never appears under ns-a; it is
// present cluster-wide, denied, with no binding label.
func TestClusterScopedRoleBindingOnly(t *testing.T) {
	sa := []rbacv1.Subject{{Kind: "ServiceAccount", Name: "ops", Namespace: "default"}}
	cs := fake.NewSimpleClientset(
		&rbacv1.ClusterRole{ObjectMeta: metav1.ObjectMeta{Name: "nr"},
			Rules: []rbacv1.PolicyRule{{APIGroups: []string{""}, Resources: []string{"nodes"}, Verbs: []string{"get"}}}},
		&rbacv1.RoleBinding{ObjectMeta: metav1.ObjectMeta{Name: "a-bind", Namespace: "ns-a"},
			Subjects: sa, RoleRef: rbacv1.RoleRef{Kind: "ClusterRole", Name: "nr"}},
	)
	cs.PrependReactor("create", "subjectaccessreviews", func(a ktesting.Action) (bool, runtime.Object, error) {
		sar := a.(ktesting.CreateAction).GetObject().(*authzv1.SubjectAccessReview)
		sar.Status.Allowed = false
		return true, sar, nil
	})
	m := decode(t, serve(t, cs, opCtx(), "/api/rbac/access?kind=ServiceAccount&namespace=default&name=ops"))
	if len(m.Scopes) != 1 || m.Scopes[0].Namespace != "" || len(m.Scopes[0].Resources) != 1 {
		t.Fatalf("scopes=%+v", m.Scopes)
	}
	if c := m.Scopes[0].Resources[0].Verbs["get"]; c.Allowed || c.Binding != "" {
		t.Fatalf("nodes get=%+v", c)
	}
}
