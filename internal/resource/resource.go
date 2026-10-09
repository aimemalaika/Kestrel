// Package resource is the generic catalog/list/get/apply/delete layer over the
// k8s seam. It owns the contract's `core` group convention.
package resource

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/aimemalaika/Kestrel/internal/audit"
	"github.com/aimemalaika/Kestrel/internal/auth"
	"github.com/aimemalaika/Kestrel/internal/k8s"
)

// DefaultProtectedNamespaces are hard-blocked for apply and delete unless
// overridden by operator configuration.
var DefaultProtectedNamespaces = []string{"kube-system", "kube-public", "kube-node-lease"}

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

// Service wraps a k8s.Client with contract conventions. It also enforces the
// protected-namespace guard and emits an audit event per mutation.
type Service struct {
	K8s       k8s.Client
	Protected map[string]bool
	Auditor   audit.Auditor
}

// NewService builds a Service with no protected namespaces and a no-op auditor.
func NewService(c k8s.Client) *Service {
	return NewServiceWith(c, nil, nil)
}

// NewServiceWith builds a Service with the given protected-namespace set and
// auditor. A nil protected set disables the guard; a nil auditor discards
// events.
func NewServiceWith(c k8s.Client, protected map[string]bool, auditor audit.Auditor) *Service {
	if auditor == nil {
		auditor = audit.Nop{}
	}
	return &Service{K8s: c, Protected: protected, Auditor: auditor}
}

// ProtectedSet turns a namespace list into a lookup set. Entries are trimmed so
// a comma-separated flag like "kube-system, kube-public" does not leave a
// leading space that silently fails to match the real namespace.
func ProtectedSet(names []string) map[string]bool {
	set := make(map[string]bool, len(names))
	for _, n := range names {
		if n = strings.TrimSpace(n); n != "" {
			set[n] = true
		}
	}
	return set
}

func (s *Service) isProtected(ns string) bool { return ns != "" && s.Protected[ns] }

// protectedTarget returns the protected namespace a write would touch, or "".
// A namespaced object is checked by its namespace. The Namespace object itself
// is cluster-scoped (empty .Namespace) and is checked by its NAME: deleting or
// mutating the kube-system Namespace is the guard's most destructive target and
// would otherwise slip past a namespace-only check.
func (s *Service) protectedTarget(ns string, isNamespaceObj bool, objName string) string {
	if s.isProtected(ns) {
		return ns
	}
	if isNamespaceObj && s.isProtected(objName) {
		return objName
	}
	return ""
}

// auditErr extracts the HTTP-ish code from an error (0 when not a StatusError)
// and a non-empty message.
func auditErr(err error) (int, string) {
	var se *k8s.StatusError
	if errors.As(err, &se) {
		return se.Code, se.Message
	}
	return 0, err.Error()
}

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

func (s *Service) Apply(ctx context.Context, obj k8s.Object, opts k8s.ApplyOptions) (k8s.Object, error) {
	if obj == nil || obj["kind"] == nil {
		return nil, &k8s.StatusError{Code: 400, Reason: "BadRequest", Message: "object must carry apiVersion, kind and metadata"}
	}
	ns := objNamespace(obj)
	name := objString(obj, "name")
	ev := audit.Event{
		Time: time.Now().UTC().Format(time.RFC3339), User: auth.From(ctx).User,
		Verb: "apply", Namespace: ns, Name: name, DryRun: opts.DryRun,
	}
	ev.Group, ev.Version = splitAPIVersion(objString(obj, "apiVersion"))
	ev.Resource = objString(obj, "kind") // best-effort type identifier for apply

	isNamespaceObj := ev.Group == "" && ev.Resource == "Namespace"
	if p := s.protectedTarget(ns, isNamespaceObj, name); p != "" {
		err := k8s.Forbidden("namespace %q is protected", p)
		s.audit(ev, err)
		return nil, err
	}
	out, err := s.K8s.Apply(ctx, obj, opts)
	s.audit(ev, err)
	return out, err
}

func (s *Service) Delete(ctx context.Context, ref k8s.Ref, opts k8s.DeleteOptions) error {
	if ref.Name == "" {
		return &k8s.StatusError{Code: 400, Reason: "BadRequest", Message: "delete requires a name"}
	}
	ev := audit.Event{
		Time: time.Now().UTC().Format(time.RFC3339), User: auth.From(ctx).User,
		Verb: "delete", Group: ref.Group, Version: ref.Version, Resource: ref.Resource,
		Namespace: ref.Namespace, Name: ref.Name, DryRun: opts.DryRun,
	}
	isNamespaceObj := ref.Group == "" && ref.Resource == "namespaces"
	if p := s.protectedTarget(ref.Namespace, isNamespaceObj, ref.Name); p != "" {
		err := k8s.Forbidden("namespace %q is protected", p)
		s.audit(ev, err)
		return err
	}
	err := s.K8s.Delete(ctx, ref, opts)
	s.audit(ev, err)
	return err
}

// audit finalises an event with the outcome and records it.
func (s *Service) audit(ev audit.Event, err error) {
	if err != nil {
		ev.Result = "error"
		ev.Code, ev.Error = auditErr(err)
	} else {
		ev.Result = "ok"
	}
	s.Auditor.Record(ev)
}

func (s *Service) CanI(ctx context.Context, req k8s.CanIRequest) (bool, error) {
	req.Group = ToInternalGroup(req.Group)
	return s.K8s.CanI(ctx, req)
}

// objNamespace reads metadata.namespace from an unstructured object.
func objNamespace(obj k8s.Object) string {
	meta, _ := obj["metadata"].(map[string]any)
	if meta == nil {
		return ""
	}
	ns, _ := meta["namespace"].(string)
	return ns
}

// objString reads a top-level string field, or metadata.name for "name".
func objString(obj k8s.Object, key string) string {
	if key == "name" {
		meta, _ := obj["metadata"].(map[string]any)
		if meta == nil {
			return ""
		}
		v, _ := meta["name"].(string)
		return v
	}
	v, _ := obj[key].(string)
	return v
}

// splitAPIVersion splits "group/version" (or "version" for core) into its
// internal group and version.
func splitAPIVersion(apiVersion string) (group, version string) {
	if i := strings.IndexByte(apiVersion, '/'); i >= 0 {
		return apiVersion[:i], apiVersion[i+1:]
	}
	return "", apiVersion
}
