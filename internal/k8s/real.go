package k8s

import (
	"context"
	"errors"
	"net/http"
	"sort"
	"strings"

	apierrors "k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/api/meta"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/discovery"
	"k8s.io/client-go/dynamic"

	"github.com/aimemalaika/Kestrel/internal/auth"
)

// Real is the client-go-backed Client. B1 implements Catalog, List and Get;
// Apply, Delete and CanI return a 501 StatusError until later sprints.
type Real struct{ acc ClusterAccessor }

// NewReal returns a Client over the given cluster accessor.
func NewReal(acc ClusterAccessor) *Real { return &Real{acc: acc} }

// Identity returns the identity carried by ctx (single-operator default when
// none). B7 will use it for impersonation, can-i and audit.
func (c *Real) Identity(ctx context.Context) auth.Identity { return auth.From(ctx) }

func notImplemented(what string) *StatusError {
	return &StatusError{Code: http.StatusNotImplemented, Reason: "NotImplemented", Message: what + " is not implemented in B1"}
}

func (c *Real) Catalog(context.Context) ([]CatalogEntry, error) {
	lists, err := discovery.ServerPreferredResources(c.acc.Discovery())
	if err != nil && len(lists) == 0 {
		return nil, mapErr(err)
	}
	// Partial discovery failures (e.g. broken aggregated APIs) are tolerated.
	entries := []CatalogEntry{}
	for _, l := range lists {
		gv, perr := schema.ParseGroupVersion(l.GroupVersion)
		if perr != nil {
			continue
		}
		for _, r := range l.APIResources {
			if strings.Contains(r.Name, "/") {
				continue // subresource
			}
			entries = append(entries, CatalogEntry{
				Group: gv.Group, Version: gv.Version, Resource: r.Name, Kind: r.Kind,
				Namespaced: r.Namespaced, Verbs: append([]string{}, r.Verbs...),
			})
		}
	}
	sort.Slice(entries, func(i, j int) bool {
		a, b := entries[i], entries[j]
		if a.Group != b.Group {
			return a.Group < b.Group
		}
		return a.Resource < b.Resource
	})
	return entries, nil
}

// resourceClient picks the namespaced or cluster-scoped dynamic client, using
// the RESTMapper to learn scope (falling back to the ref's namespace).
func (c *Real) resourceClient(ref Ref) dynamic.ResourceInterface {
	gvr := schema.GroupVersionResource{Group: ref.Group, Version: ref.Version, Resource: ref.Resource}
	ri := c.acc.Dynamic().Resource(gvr)
	if ref.Namespace == "" {
		return ri
	}
	if kind, err := c.acc.Mapper().KindFor(gvr); err == nil {
		if m, err := c.acc.Mapper().RESTMapping(kind.GroupKind(), kind.Version); err == nil && m.Scope.Name() == meta.RESTScopeNameRoot {
			return ri
		}
	}
	return ri.Namespace(ref.Namespace)
}

func (c *Real) List(ctx context.Context, ref Ref, opts ListOptions) ([]Object, error) {
	l, err := c.resourceClient(ref).List(ctx, metav1.ListOptions{
		LabelSelector: opts.LabelSelector,
		FieldSelector: opts.FieldSelector,
	})
	if err != nil {
		return nil, mapErr(err)
	}
	out := make([]Object, 0, len(l.Items))
	for i := range l.Items {
		out = append(out, l.Items[i].Object)
	}
	return out, nil
}

func (c *Real) Get(ctx context.Context, ref Ref) (Object, error) {
	o, err := c.resourceClient(ref).Get(ctx, ref.Name, metav1.GetOptions{})
	if err != nil {
		return nil, mapErr(err)
	}
	return o.Object, nil
}

func (c *Real) Apply(context.Context, Object, bool) (Object, error) {
	return nil, notImplemented("apply")
}
func (c *Real) Delete(context.Context, Ref, bool) error { return notImplemented("delete") }
func (c *Real) CanI(context.Context, CanIRequest) (bool, error) {
	return false, notImplemented("can-i")
}

// mapErr converts API errors to *StatusError with the real code and reason.
func mapErr(err error) error {
	var st apierrors.APIStatus
	if errors.As(err, &st) {
		s := st.Status()
		code := int(s.Code)
		if code == 0 {
			code = 500 // some synthesized apierrors leave Code unset; never emit WriteHeader(0)
		}
		return &StatusError{Code: code, Reason: string(s.Reason), Message: s.Message}
	}
	return err
}
