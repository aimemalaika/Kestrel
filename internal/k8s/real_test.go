package k8s

import (
	"context"
	"errors"
	"testing"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	fakediscovery "k8s.io/client-go/discovery/fake"
	dynfake "k8s.io/client-go/dynamic/fake"
	kubefake "k8s.io/client-go/kubernetes/fake"
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
	deps, err := c.List(ctx, ref)
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
	nss, err := c.List(ctx, nsRef)
	if err != nil || len(nss) != 2 {
		t.Fatalf("namespaces: %v %d", err, len(nss))
	}
	podRef := Ref{GVR: GVR{Version: "v1", Resource: "pods"}, Namespace: "default"}
	pods, err := c.List(ctx, podRef)
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

func TestUnimplemented(t *testing.T) {
	_, err := newTestReal(t).Apply(context.Background(), Object{}, false)
	var se *StatusError
	if !errors.As(err, &se) || se.Code != 501 {
		t.Fatalf("want 501, got %v", err)
	}
}
