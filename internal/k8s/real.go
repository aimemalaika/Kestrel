package k8s

import (
	"context"
	"errors"
	"net/http"
	"sort"
	"strings"

	authzv1 "k8s.io/api/authorization/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/api/meta"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/discovery"
	"k8s.io/client-go/dynamic"

	"github.com/aimemalaika/Kestrel/internal/auth"
)

// Real is the client-go-backed Client implementing the full CRUD seam
// (Catalog, List, Get, Apply, Delete, CanI).
type Real struct{ acc ClusterAccessor }

// NewReal returns a Client over the given cluster accessor.
func NewReal(acc ClusterAccessor) *Real { return &Real{acc: acc} }

// Identity returns the identity carried by ctx (single-operator default when
// none). B7 will use it for impersonation, can-i and audit.
func (c *Real) Identity(ctx context.Context) auth.Identity { return auth.From(ctx) }

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

// Apply performs a dynamic-client Server-Side Apply. It resolves the object's
// GVR and scope from its apiVersion/kind via the RESTMapper, so no pre-built
// Ref is needed. DryRun runs real admission (DryRunAll) and returns the merged
// object without persisting. Force (default false) lets conflicts surface as
// 409 unless the caller opts in.
func (c *Real) Apply(ctx context.Context, obj Object, opts ApplyOptions) (Object, error) {
	u := &unstructured.Unstructured{Object: obj}
	apiVersion := u.GetAPIVersion()
	kind := u.GetKind()
	name := u.GetName()
	if apiVersion == "" || kind == "" || name == "" {
		return nil, &StatusError{Code: http.StatusBadRequest, Reason: "BadRequest",
			Message: "apply requires apiVersion, kind and metadata.name"}
	}
	gv, err := schema.ParseGroupVersion(apiVersion)
	if err != nil {
		return nil, &StatusError{Code: http.StatusBadRequest, Reason: "BadRequest",
			Message: "invalid apiVersion " + apiVersion + ": " + err.Error()}
	}
	mapping, err := c.acc.Mapper().RESTMapping(gv.WithKind(kind).GroupKind(), gv.Version)
	if err != nil {
		return nil, mapErr(err)
	}
	ri := c.acc.Dynamic().Resource(mapping.Resource)
	var client dynamic.ResourceInterface = ri
	if mapping.Scope.Name() == meta.RESTScopeNameNamespace {
		client = ri.Namespace(u.GetNamespace())
	}

	fm := opts.FieldManager
	if fm == "" {
		fm = DefaultFieldManager
	}
	var dryRun []string
	if opts.DryRun {
		dryRun = []string{metav1.DryRunAll}
	}
	applied, err := client.Apply(ctx, name, u, metav1.ApplyOptions{
		FieldManager: fm,
		Force:        opts.Force,
		DryRun:       dryRun,
	})
	if err != nil {
		return nil, mapErr(err)
	}
	return applied.Object, nil
}

// Delete removes the referenced object with Background propagation (kubectl's
// default). DryRun runs admission without removing anything.
func (c *Real) Delete(ctx context.Context, ref Ref, opts DeleteOptions) error {
	background := metav1.DeletePropagationBackground
	var dryRun []string
	if opts.DryRun {
		dryRun = []string{metav1.DryRunAll}
	}
	err := c.resourceClient(ref).Delete(ctx, ref.Name, metav1.DeleteOptions{
		PropagationPolicy: &background,
		DryRun:            dryRun,
	})
	if err != nil {
		return mapErr(err)
	}
	return nil
}

// CanI runs a SelfSubjectAccessReview against Kestrel's OWN token (no
// impersonation — that trust is gated in B7). The Group arriving here is the
// internal group ("" for core); resource.Service maps "core" before calling.
func (c *Real) CanI(ctx context.Context, req CanIRequest) (bool, error) {
	ssar := &authzv1.SelfSubjectAccessReview{
		Spec: authzv1.SelfSubjectAccessReviewSpec{
			ResourceAttributes: &authzv1.ResourceAttributes{
				Verb:      req.Verb,
				Group:     req.Group,
				Version:   req.Version,
				Resource:  req.Resource,
				Namespace: req.Namespace,
				Name:      req.Name,
			},
		},
	}
	res, err := c.acc.Kubernetes().AuthorizationV1().SelfSubjectAccessReviews().Create(ctx, ssar, metav1.CreateOptions{})
	if err != nil {
		return false, mapErr(err)
	}
	return res.Status.Allowed, nil
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
