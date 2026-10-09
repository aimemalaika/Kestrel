package resource

import (
	"context"
	"errors"
	"testing"

	"github.com/aimemalaika/Kestrel/internal/audit"
	"github.com/aimemalaika/Kestrel/internal/auth"
	"github.com/aimemalaika/Kestrel/internal/k8s"
)

// fakeClient records whether Apply/Delete were forwarded.
type fakeClient struct {
	k8s.Stub
	applied, deleted bool
}

func (f *fakeClient) Apply(_ context.Context, obj k8s.Object, _ k8s.ApplyOptions) (k8s.Object, error) {
	f.applied = true
	return obj, nil
}
func (f *fakeClient) Delete(context.Context, k8s.Ref, k8s.DeleteOptions) error {
	f.deleted = true
	return nil
}

// capture is an Auditor that records every event it sees.
type capture struct{ events []audit.Event }

func (c *capture) Record(ev audit.Event) { c.events = append(c.events, ev) }

func (c *capture) last() audit.Event { return c.events[len(c.events)-1] }

func applyObj(ns string) k8s.Object {
	return k8s.Object{
		"apiVersion": "v1", "kind": "ConfigMap",
		"metadata": map[string]any{"name": "c", "namespace": ns},
	}
}

func newSvc(c k8s.Client, aud audit.Auditor) *Service {
	return NewServiceWith(c, ProtectedSet(DefaultProtectedNamespaces), aud)
}

func ctxUser(u string) context.Context {
	return auth.WithIdentity(context.Background(), auth.Identity{User: u})
}

func TestApplyProtectedNamespaceBlocked(t *testing.T) {
	fc := &fakeClient{}
	cap := &capture{}
	svc := newSvc(fc, cap)

	_, err := svc.Apply(ctxUser("alice"), applyObj("kube-system"), k8s.ApplyOptions{})
	var se *k8s.StatusError
	if !errors.As(err, &se) || se.Code != 403 || se.Reason != "Forbidden" {
		t.Fatalf("want 403 Forbidden, got %#v", err)
	}
	if fc.applied {
		t.Error("protected apply must NOT be forwarded to the cluster")
	}
	ev := cap.last()
	if ev.Result != "error" || ev.Code != 403 || ev.Verb != "apply" || ev.Namespace != "kube-system" {
		t.Errorf("audit event wrong: %+v", ev)
	}
	if ev.User != "alice" {
		t.Errorf("audited user should come from ctx, got %q", ev.User)
	}
}

func TestDeleteProtectedNamespaceBlocked(t *testing.T) {
	fc := &fakeClient{}
	cap := &capture{}
	svc := newSvc(fc, cap)

	ref := Ref("core", "v1", "kube-public", "configmaps", "c")
	err := svc.Delete(ctxUser("bob"), ref, k8s.DeleteOptions{})
	var se *k8s.StatusError
	if !errors.As(err, &se) || se.Code != 403 {
		t.Fatalf("want 403, got %#v", err)
	}
	if fc.deleted {
		t.Error("protected delete must NOT be forwarded")
	}
	ev := cap.last()
	if ev.Result != "error" || ev.Code != 403 || ev.Verb != "delete" || ev.User != "bob" {
		t.Errorf("audit event wrong: %+v", ev)
	}
}

func TestApplyNormalNamespaceForwardsAndAudits(t *testing.T) {
	fc := &fakeClient{}
	cap := &capture{}
	svc := newSvc(fc, cap)

	if _, err := svc.Apply(ctxUser("carol"), applyObj("team-a"), k8s.ApplyOptions{}); err != nil {
		t.Fatalf("apply: %v", err)
	}
	if !fc.applied {
		t.Error("normal-namespace apply must be forwarded")
	}
	ev := cap.last()
	if ev.Result != "ok" || ev.Verb != "apply" || ev.Namespace != "team-a" || ev.Name != "c" {
		t.Errorf("audit event wrong: %+v", ev)
	}
	if ev.Group != "" || ev.Version != "v1" || ev.Resource != "ConfigMap" {
		t.Errorf("gvr audit wrong: %+v", ev)
	}
	if ev.DryRun {
		t.Error("DryRun should be false")
	}
}

func TestDeleteNormalNamespaceForwardsDryRunAudited(t *testing.T) {
	fc := &fakeClient{}
	cap := &capture{}
	svc := newSvc(fc, cap)

	ref := Ref("apps", "v1", "team-a", "deployments", "web")
	if err := svc.Delete(ctxUser("dan"), ref, k8s.DeleteOptions{DryRun: true}); err != nil {
		t.Fatalf("delete: %v", err)
	}
	if !fc.deleted {
		t.Error("normal-namespace delete must be forwarded")
	}
	ev := cap.last()
	if ev.Result != "ok" || !ev.DryRun || ev.Group != "apps" || ev.Resource != "deployments" {
		t.Errorf("dry-run delete audit wrong: %+v", ev)
	}
}

// Deleting the protected Namespace OBJECT itself (cluster-scoped: empty
// .Namespace, name=kube-system) must be blocked by the name-based guard, not
// forwarded. This is the guard's most destructive target.
func TestDeleteNamespaceObjectBlocked(t *testing.T) {
	fc := &fakeClient{}
	cap := &capture{}
	svc := newSvc(fc, cap)

	ref := Ref("core", "v1", "", "namespaces", "kube-system")
	err := svc.Delete(ctxUser("eve"), ref, k8s.DeleteOptions{})
	var se *k8s.StatusError
	if !errors.As(err, &se) || se.Code != 403 {
		t.Fatalf("deleting the kube-system Namespace must be 403, got %#v", err)
	}
	if fc.deleted {
		t.Fatal("deleting a protected Namespace object must NOT reach the cluster")
	}
	if ev := cap.last(); ev.Result != "error" || ev.Code != 403 {
		t.Errorf("audit event wrong: %+v", ev)
	}
}

// Applying (SSA) the protected Namespace object must likewise be blocked.
func TestApplyNamespaceObjectBlocked(t *testing.T) {
	fc := &fakeClient{}
	svc := newSvc(fc, &capture{})
	obj := k8s.Object{
		"apiVersion": "v1", "kind": "Namespace",
		"metadata": map[string]any{"name": "kube-system"},
	}
	_, err := svc.Apply(ctxUser("eve"), obj, k8s.ApplyOptions{})
	var se *k8s.StatusError
	if !errors.As(err, &se) || se.Code != 403 {
		t.Fatalf("applying the kube-system Namespace must be 403, got %#v", err)
	}
	if fc.applied {
		t.Fatal("applying a protected Namespace object must NOT reach the cluster")
	}
}

// A non-protected Namespace object is unaffected by the name-based guard.
func TestDeleteUnprotectedNamespaceObjectForwards(t *testing.T) {
	fc := &fakeClient{}
	svc := newSvc(fc, &capture{})
	ref := Ref("core", "v1", "", "namespaces", "team-a")
	if err := svc.Delete(ctxUser("eve"), ref, k8s.DeleteOptions{}); err != nil {
		t.Fatalf("delete: %v", err)
	}
	if !fc.deleted {
		t.Error("deleting a non-protected Namespace object must be forwarded")
	}
}

// Protected-namespace entries are trimmed, so a flag value with surrounding
// whitespace still matches the real namespace.
func TestProtectedSetTrimsWhitespace(t *testing.T) {
	set := ProtectedSet([]string{"kube-system", " kube-public ", "\tteam-x"})
	for _, ns := range []string{"kube-system", "kube-public", "team-x"} {
		if !set[ns] {
			t.Errorf("namespace %q should be protected after trimming", ns)
		}
	}
	if set[" kube-public "] {
		t.Error("untrimmed key must not be present")
	}
}

// With the guard disabled (empty protected set) a kube-system write proceeds.
func TestGuardDisabled(t *testing.T) {
	fc := &fakeClient{}
	svc := NewServiceWith(fc, ProtectedSet([]string{""}), nil)
	if _, err := svc.Apply(context.Background(), applyObj("kube-system"), k8s.ApplyOptions{}); err != nil {
		t.Fatalf("apply: %v", err)
	}
	if !fc.applied {
		t.Error("disabled guard should forward even to kube-system")
	}
}
