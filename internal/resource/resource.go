// Package resource is the generic catalog/list/get/apply/delete layer over the
// k8s seam. It owns the contract's `core` group convention.
package resource

import (
	"context"

	"github.com/aimemalaika/Kestrel/internal/k8s"
)

// CoreGroup is the contract's name for the empty (core/v1) group.
const CoreGroup = "core"

// ToInternalGroup maps the wire group to the cluster group ("core" -> "").
func ToInternalGroup(g string) string {
	if g == CoreGroup {
		return ""
	}
	return g
}

// ToWireGroup maps a cluster group to the wire group ("" -> "core").
func ToWireGroup(g string) string {
	if g == "" {
		return CoreGroup
	}
	return g
}

// Service wraps a k8s.Client with contract conventions.
type Service struct{ K8s k8s.Client }

func NewService(c k8s.Client) *Service { return &Service{K8s: c} }

func (s *Service) Catalog(ctx context.Context) ([]k8s.CatalogEntry, error) {
	entries, err := s.K8s.Catalog(ctx)
	if err != nil {
		return nil, err
	}
	if entries == nil {
		entries = []k8s.CatalogEntry{}
	}
	for i := range entries {
		entries[i].Group = ToWireGroup(entries[i].Group)
	}
	return entries, nil
}

// Ref builds an internal Ref from wire-level path parts.
func Ref(group, version, ns, res, name string) k8s.Ref {
	return k8s.Ref{
		GVR:       k8s.GVR{Group: ToInternalGroup(group), Version: version, Resource: res},
		Namespace: ns,
		Name:      name,
	}
}

func (s *Service) List(ctx context.Context, ref k8s.Ref, opts k8s.ListOptions) ([]k8s.Object, error) {
	items, err := s.K8s.List(ctx, ref, opts)
	if items == nil {
		items = []k8s.Object{}
	}
	return items, err
}

func (s *Service) Get(ctx context.Context, ref k8s.Ref) (k8s.Object, error) {
	return s.K8s.Get(ctx, ref)
}

func (s *Service) Apply(ctx context.Context, obj k8s.Object, dryRun bool) (k8s.Object, error) {
	if obj == nil || obj["kind"] == nil {
		return nil, &k8s.StatusError{Code: 400, Reason: "BadRequest", Message: "object must carry apiVersion, kind and metadata"}
	}
	return s.K8s.Apply(ctx, obj, dryRun)
}

func (s *Service) Delete(ctx context.Context, ref k8s.Ref, dryRun bool) error {
	if ref.Name == "" {
		return &k8s.StatusError{Code: 400, Reason: "BadRequest", Message: "delete requires a name"}
	}
	return s.K8s.Delete(ctx, ref, dryRun)
}

func (s *Service) CanI(ctx context.Context, req k8s.CanIRequest) (bool, error) {
	req.Group = ToInternalGroup(req.Group)
	return s.K8s.CanI(ctx, req)
}
