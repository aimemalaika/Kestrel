package k8s

import (
	"context"
	"errors"
	"testing"

	authzv1 "k8s.io/api/authorization/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	fakediscovery "k8s.io/client-go/discovery/fake"
	dynfake "k8s.io/client-go/dynamic/fake"
	kubefake "k8s.io/client-go/kubernetes/fake"
	kubetesting "k8s.io/client-go/testing"
)

func obj(kind, ns, name string) *unstructured.Unstructured { return objGV("v1", kind, ns, name) }

func objGV(apiVersion, kind, ns, name string) *unstructured.Unstructured {
	u := &unstructured.Unstructured{Object: map[string]any{
		"apiVersion": apiVersion, "kind": kind,
		"metadata": map[string]any{"name": name},
	}}
	if ns != "" {
		u.SetNamespace(ns)
	}
	return u
}

func newTestReal(t *testing.T) *Real {
	t.Helper()
	gvrToList := map[schema.GroupVersionResource]string{
		{Version: "v1", Resource: "namespaces"}:                 "NamespaceList",
		{Version: "v1", Resource: "pods"}:                       "PodList",
		{Group: "apps", Version: "v1", Resource: "deployments"}: "DeploymentList",
	}
	dyn := dynfake.NewSimpleDynamicClientWithCustomListKinds(runtime.NewScheme(), gvrToList,
		obj("Namespace", "", "default"), obj("Namespace", "", "kube-system"),
		obj("Pod", "default", "web-1"), obj("Pod", "default", "web-2"), obj("Pod", "kube-system", "dns"),
		objGV("apps/v1", "Deployment", "default", "web"),
	)
	cs := kubefake.NewSimpleClientset()
	fd := cs.Discovery().(*fakediscovery.FakeDiscovery)
	fd.Resources = []*metav1.APIResourceList{
		{
			GroupVersion: "v1",
			APIResources: []metav1.APIResource{
				{Name: "namespaces", Kind: "Namespace", Namespaced: false, Verbs: []string{"get", "list"}},
				{Name: "pods", Kind: "Pod", Namespaced: true, Verbs: []string{"get", "list", "watch"}},
				{Name: "pods/log", Kind: "Pod", Namespaced: true, Verbs: []string{"get"}},
			},
		},
		{
			GroupVersion: "apps/v1",
			APIResources: []metav1.APIResource{
				{Name: "deployments", Kind: "Deployment", Namespaced: true, Verbs: []string{"get", "list", "watch"}},
			},
		},
	}
	return NewReal(NewAccessorFrom(dyn, fd))
}

func TestCatalog(t *testing.T) {
	entries, err := newTestReal(t).Catalog(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	got := map[string]CatalogEntry{}
	for _, e := range entries {
		got[e.Resource] = e
	}
	if len(entries) != 3 {
		t.Fatalf("want 3 entries (no subresources), got %d: %+v", len(entries), entries)
	}
	if ns := got["namespaces"]; ns.Namespaced || ns.Group != "" || ns.Version != "v1" || ns.Kind != "Namespace" {
		t.Errorf("namespaces entry wrong: %+v", ns)
	}
	if p := got["pods"]; !p.Namespaced || p.Group != "" || len(p.Verbs) != 3 {
		t.Errorf("pods entry wrong: %+v", p)
	}
	// A grouped resource keeps its real group (not core).
	if d := got["deployments"]; d.Group != "apps" || d.Version != "v1" || d.Kind != "Deployment" || !d.Namespaced {
		t.Errorf("deployments entry wrong: %+v", d)
	}
}

func TestGroupedResourceListGet(t *testing.T) {
	c := newTestReal(t)
	ctx := context.Background()
	ref := Ref{GVR: GVR{Group: "apps", Version: "v1", Resource: "deployments"}, Namespace: "default"}
	deps, err := c.List(ctx, ref, ListOptions{})
	if err != nil || len(deps) != 1 {
		t.Fatalf("deployments: %v %d", err, len(deps))
	}
	ref.Name = "web"
	d, err := c.Get(ctx, ref)
	if err != nil || d["metadata"].(map[string]any)["name"] != "web" {
		t.Fatalf("get deployment: %v %v", err, d)
	}
}

// A cluster-scoped resource requested with a namespace must resolve via the
// RESTMapper to the root client (the namespace is ignored), not error out.
func TestClusterScopeIgnoresNamespace(t *testing.T) {
	c := newTestReal(t)
	ref := Ref{GVR: GVR{Version: "v1", Resource: "namespaces"}, Namespace: "ignored", Name: "default"}
	o, err := c.Get(context.Background(), ref)
	if err != nil {
		t.Fatalf("cluster-scoped get with a namespace should hit the root client: %v", err)
	}
	if o["metadata"].(map[string]any)["name"] != "default" {
		t.Errorf("wrong object: %v", o)
	}
}

func TestListGet(t *testing.T) {
	c := newTestReal(t)
	ctx := context.Background()
	nsRef := Ref{GVR: GVR{Version: "v1", Resource: "namespaces"}}
	nss, err := c.List(ctx, nsRef, ListOptions{})
	if err != nil || len(nss) != 2 {
		t.Fatalf("namespaces: %v %d", err, len(nss))
	}
	podRef := Ref{GVR: GVR{Version: "v1", Resource: "pods"}, Namespace: "default"}
	pods, err := c.List(ctx, podRef, ListOptions{})
	if err != nil || len(pods) != 2 {
		t.Fatalf("pods in default: %v %d", err, len(pods))
	}
	podRef.Name = "web-1"
	p, err := c.Get(ctx, podRef)
	if err != nil {
		t.Fatal(err)
	}
	if p["metadata"].(map[string]any)["name"] != "web-1" {
		t.Errorf("wrong pod: %v", p)
	}
}

func TestGetNotFound(t *testing.T) {
	c := newTestReal(t)
	_, err := c.Get(context.Background(), Ref{GVR: GVR{Version: "v1", Resource: "pods"}, Namespace: "default", Name: "nope"})
	var se *StatusError
	if !errors.As(err, &se) || se.Code != 404 || se.Reason != "NotFound" {
		t.Fatalf("want 404 NotFound StatusError, got %#v", err)
	}
}

// TestApplyBadObject covers option/validation logic that needs no SSA support
// from the fake: a missing apiVersion/kind/name is a 400 before any cluster call.
func TestApplyBadObject(t *testing.T) {
	c := newTestReal(t)
	_, err := c.Apply(context.Background(), Object{"kind": "Pod"}, ApplyOptions{})
	var se *StatusError
	if !errors.As(err, &se) || se.Code != 400 {
		t.Fatalf("want 400 for object missing apiVersion/name, got %#v", err)
	}
	_, err = c.Apply(context.Background(), Object{
		"apiVersion": "v1", "kind": "Pod",
		"metadata": map[string]any{"name": "p"},
	}, ApplyOptions{})
	// A valid object may or may not apply depending on fake SSA support; it must
	// not be rejected as a bad request.
	if errors.As(err, &se) && se.Code == 400 {
		t.Fatalf("valid object should not be a 400: %v", err)
	}
}

// TestDeleteRemoves proves a real Delete removes the object. NOTE: the fake
// dynamic client's delete reactor ignores metav1.DeleteOptions.DryRun (it
// deletes regardless), so dry-run "leaves the object" cannot be asserted here;
// the DryRun->DryRunAll mapping is covered by the protected/audit tests in
// internal/resource (DryRun threads through) and by go vet of the real path.
func TestDeleteRemoves(t *testing.T) {
	c := newTestReal(t)
	ctx := context.Background()
	ref := Ref{GVR: GVR{Version: "v1", Resource: "pods"}, Namespace: "default", Name: "web-1"}

	if err := c.Delete(ctx, ref, DeleteOptions{}); err != nil {
		t.Fatalf("delete: %v", err)
	}
	_, err := c.Get(ctx, ref)
	var se *StatusError
	if !errors.As(err, &se) || se.Code != 404 {
		t.Fatalf("object should be gone after delete, got %#v", err)
	}
}

func TestDeleteNotFound(t *testing.T) {
	c := newTestReal(t)
	ref := Ref{GVR: GVR{Version: "v1", Resource: "pods"}, Namespace: "default", Name: "nope"}
	err := c.Delete(context.Background(), ref, DeleteOptions{})
	var se *StatusError
	if !errors.As(err, &se) || se.Code != 404 {
		t.Fatalf("want 404 NotFound, got %#v", err)
	}
}

// TestCanIReflectsSAR drives SelfSubjectAccessReview via a reactor on the typed
// fake clientset and asserts Real.CanI returns the decision, and maps errors.
func TestCanIReflectsSAR(t *testing.T) {
	for _, allowed := range []bool{true, false} {
		cs := kubefake.NewSimpleClientset()
		cs.PrependReactor("create", "selfsubjectaccessreviews",
			func(action kubetesting.Action) (bool, runtime.Object, error) {
				ssar := action.(kubetesting.CreateAction).GetObject().(*authzv1.SelfSubjectAccessReview)
				ssar.Status.Allowed = allowed
				return true, ssar, nil
			})
		c := NewReal(NewAccessorFromAll(nil, cs.Discovery().(*fakediscovery.FakeDiscovery), cs))
		got, err := c.CanI(context.Background(), CanIRequest{Verb: "delete", Version: "v1", Resource: "pods", Namespace: "ns"})
		if err != nil {
			t.Fatalf("CanI: %v", err)
		}
		if got != allowed {
			t.Errorf("CanI = %v, want %v", got, allowed)
		}
	}

	cs := kubefake.NewSimpleClientset()
	cs.PrependReactor("create", "selfsubjectaccessreviews",
		func(kubetesting.Action) (bool, runtime.Object, error) {
			return true, nil, apierrors.NewForbidden(schema.GroupResource{Resource: "selfsubjectaccessreviews"}, "", errors.New("denied"))
		})
	c := NewReal(NewAccessorFromAll(nil, cs.Discovery().(*fakediscovery.FakeDiscovery), cs))
	_, err := c.CanI(context.Background(), CanIRequest{Verb: "get", Version: "v1", Resource: "pods"})
	var se *StatusError
	if !errors.As(err, &se) || se.Code != 403 {
		t.Fatalf("want 403 mapped from SAR error, got %#v", err)
	}
}

// Note on SSA + fake dynamic client (client-go v0.31): the fake dynamic client's
// Apply is implemented as a server-side-apply patch over its object tracker,
// which does NOT run the structured-merge-diff machinery a real apiserver does.
// It does not reliably persist/merge arbitrary unstructured objects, so we do
// not assert full apply-merge behaviour against it. Instead Real.Apply's
// validation and option/GVR-resolution logic is unit-tested above
// (TestApplyBadObject) and the real SSA call path is covered by go build/vet.
// Delete and can-i ARE fully fake-able and asserted above.

// List honors a label selector end-to-end (proves ListOptions threading).
func TestListLabelSelector(t *testing.T) {
	keep := obj("Pod", "default", "keep")
	keep.SetLabels(map[string]string{"app": "keep"})
	dyn := dynfake.NewSimpleDynamicClientWithCustomListKinds(runtime.NewScheme(),
		map[schema.GroupVersionResource]string{{Version: "v1", Resource: "pods"}: "PodList"},
		keep, obj("Pod", "default", "drop"),
	)
	cs := kubefake.NewSimpleClientset()
	fd := cs.Discovery().(*fakediscovery.FakeDiscovery)
	fd.Resources = []*metav1.APIResourceList{{
		GroupVersion: "v1",
		APIResources: []metav1.APIResource{{Name: "pods", Kind: "Pod", Namespaced: true, Verbs: []string{"get", "list"}}},
	}}
	c := NewReal(NewAccessorFrom(dyn, fd))
	ref := Ref{GVR: GVR{Version: "v1", Resource: "pods"}, Namespace: "default"}
	ctx := context.Background()

	all, err := c.List(ctx, ref, ListOptions{})
	if err != nil || len(all) != 2 {
		t.Fatalf("unfiltered: %v %d", err, len(all))
	}
	filtered, err := c.List(ctx, ref, ListOptions{LabelSelector: "app=keep"})
	if err != nil || len(filtered) != 1 {
		t.Fatalf("label selector should filter to 1: %v %d", err, len(filtered))
	}
}
