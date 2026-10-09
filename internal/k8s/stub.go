package k8s

import (
	"context"
	"fmt"
)

// Stub is the B0 placeholder Client returning contract-shaped data.
type Stub struct{}

func (Stub) Catalog(context.Context) ([]CatalogEntry, error) {
	all := []string{"get", "list", "watch", "create", "update", "patch", "delete"}
	// The Client returns the INTERNAL group (core/v1 is the empty group), exactly
	// as client-go will in B1; resource.Catalog maps "" -> "core" for the wire.
	return []CatalogEntry{
		{Group: "", Version: "v1", Resource: "pods", Kind: "Pod", Namespaced: true, Verbs: all},
		{Group: "apps", Version: "v1", Resource: "deployments", Kind: "Deployment", Namespaced: true, Verbs: all},
		{Group: "", Version: "v1", Resource: "nodes", Kind: "Node", Namespaced: false, Verbs: []string{"get", "list", "watch"}},
	}, nil
}

// StubObject builds a minimal unstructured object.
func StubObject(ref Ref) Object {
	apiVersion := ref.Version
	if ref.Group != "" {
		apiVersion = ref.Group + "/" + ref.Version
	}
	meta := Object{"name": ref.Name, "resourceVersion": "1"}
	if ref.Namespace != "" {
		meta["namespace"] = ref.Namespace
	}
	return Object{"apiVersion": apiVersion, "kind": "Stub", "metadata": meta}
}

func (Stub) List(_ context.Context, ref Ref) ([]Object, error) {
	items := make([]Object, 0, 2)
	for i := 1; i <= 2; i++ {
		r := ref
		r.Name = fmt.Sprintf("%s-%d", ref.Resource, i)
		items = append(items, StubObject(r))
	}
	return items, nil
}

func (Stub) Get(_ context.Context, ref Ref) (Object, error) {
	return StubObject(ref), nil
}

func (Stub) Apply(_ context.Context, obj Object, _ bool) (Object, error) {
	return obj, nil
}

func (Stub) Delete(context.Context, Ref, bool) error { return nil }

func (Stub) CanI(context.Context, CanIRequest) (bool, error) { return true, nil }
