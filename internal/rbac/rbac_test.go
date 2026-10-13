package rbac

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
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
	rec := serve(t, seeded(), opCtx(), "/api/rbac/access?namespace=prod&name=api")
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
	for _, r := range m.Resources {
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
	rec := serve(t, nil, opCtx(), "/api/rbac/access?namespace=prod&name=api")
	if rec.Code != 200 {
		t.Fatalf("code=%d", rec.Code)
	}
	var m Matrix
	_ = json.Unmarshal(rec.Body.Bytes(), &m)
	if m.Resources == nil || len(m.Resources) != 0 {
		t.Fatalf("resources=%v", m.Resources)
	}
}

func TestForbiddenSAR(t *testing.T) {
	cs := seeded()
	cs.PrependReactor("create", "subjectaccessreviews", func(ktesting.Action) (bool, runtime.Object, error) {
		return true, nil, apierrors.NewForbidden(schema.GroupResource{Group: "authorization.k8s.io", Resource: "subjectaccessreviews"}, "", nil)
	})
	rec := serve(t, cs, opCtx(), "/api/rbac/access?namespace=prod&name=api")
	if rec.Code != http.StatusForbidden {
		t.Fatalf("code=%d body=%s", rec.Code, rec.Body)
	}
}

func TestForbiddenRBACList(t *testing.T) {
	cs := seeded()
	cs.PrependReactor("list", "rolebindings", func(ktesting.Action) (bool, runtime.Object, error) {
		return true, nil, apierrors.NewForbidden(schema.GroupResource{Group: "rbac.authorization.k8s.io", Resource: "rolebindings"}, "", nil)
	})
	rec := serve(t, cs, opCtx(), "/api/rbac/access?namespace=prod&name=api")
	if rec.Code != http.StatusForbidden {
		t.Fatalf("code=%d", rec.Code)
	}
}

func TestValidationAndRouting(t *testing.T) {
	for url, want := range map[string]int{
		"/api/rbac/access":                      400,
		"/api/rbac/access?namespace=a/b&name=x": 400,
		"/api/rbac/nope":                        404,
	} {
		if rec := serve(t, seeded(), opCtx(), url); rec.Code != want {
			t.Fatalf("%s: code=%d want %d", url, rec.Code, want)
		}
	}
	req := httptest.NewRequest(http.MethodPost, "/api/rbac/access?namespace=a&name=b", nil)
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
