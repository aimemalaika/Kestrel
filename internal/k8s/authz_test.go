package k8s

import (
	"context"
	"sync/atomic"
	"testing"
	"time"

	authzv1 "k8s.io/api/authorization/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/client-go/kubernetes"
	kubefake "k8s.io/client-go/kubernetes/fake"
	kubetesting "k8s.io/client-go/testing"

	"github.com/aimemalaika/Kestrel/internal/auth"
)

// sarRig builds an SSARAuthorizer whose per-user client is a shared fake
// clientset with a SelfSubjectAccessReview reactor. decide answers each SSAR by
// its namespace; count tallies how many SSARs actually hit the apiserver, so a
// TTL cache hit is observable as a non-increment.
func sarRig(t *testing.T, ttl time.Duration, decide func(ns string) bool) (*SSARAuthorizer, *int32) {
	t.Helper()
	var count int32
	cs := kubefake.NewSimpleClientset()
	cs.PrependReactor("create", "selfsubjectaccessreviews",
		func(action kubetesting.Action) (bool, runtime.Object, error) {
			atomic.AddInt32(&count, 1)
			ssar := action.(kubetesting.CreateAction).GetObject().(*authzv1.SelfSubjectAccessReview)
			ssar.Status.Allowed = decide(ssar.Spec.ResourceAttributes.Namespace)
			return true, ssar, nil
		})
	a := &SSARAuthorizer{ttl: ttl, cache: map[string]sarDecision{}}
	a.clientFor = func(string) (kubernetes.Interface, error) { return cs, nil }
	return a, &count
}

func gvrCM() GVR { return GVR{Version: "v1", Resource: "configmaps"} }

func tokCtx(user, token string) context.Context {
	return auth.WithIdentity(context.Background(), auth.Identity{User: user, Token: token})
}

// TestCanListReflectsSSAR: CanList returns the apiserver's decision for both
// allow and deny, per namespace.
func TestCanListReflectsSSAR(t *testing.T) {
	a, _ := sarRig(t, defaultSARTTL, func(ns string) bool { return ns == "team-a" })
	ctx := tokCtx("alice", "tok")

	if ok, err := a.CanList(ctx, gvrCM(), "team-a"); err != nil || !ok {
		t.Fatalf("team-a: got (%v,%v), want (true,nil)", ok, err)
	}
	if ok, err := a.CanList(ctx, gvrCM(), "team-b"); err != nil || ok {
		t.Fatalf("team-b: got (%v,%v), want (false,nil)", ok, err)
	}
}

// TestCanListTTLCacheHit: a repeated query inside the TTL reuses the decision —
// no second SSAR. Both allow and deny decisions are cached.
func TestCanListTTLCacheHit(t *testing.T) {
	a, count := sarRig(t, time.Hour, func(ns string) bool { return ns == "team-a" })
	ctx := tokCtx("alice", "tok")

	for i := 0; i < 3; i++ {
		if ok, err := a.CanList(ctx, gvrCM(), "team-a"); err != nil || !ok {
			t.Fatalf("allow #%d: (%v,%v)", i, ok, err)
		}
	}
	for i := 0; i < 3; i++ {
		if ok, err := a.CanList(ctx, gvrCM(), "team-b"); err != nil || ok {
			t.Fatalf("deny #%d: (%v,%v)", i, ok, err)
		}
	}
	// One SSAR per distinct namespace (allow cached + deny cached), not per call.
	if n := atomic.LoadInt32(count); n != 2 {
		t.Fatalf("SSAR count = %d, want 2 (one per namespace, rest cached)", n)
	}
}

// TestCanListTTLExpiry: once the TTL lapses, a fresh SSAR is issued.
func TestCanListTTLExpiry(t *testing.T) {
	a, count := sarRig(t, time.Millisecond, func(string) bool { return true })
	ctx := tokCtx("alice", "tok")

	if _, err := a.CanList(ctx, gvrCM(), "team-a"); err != nil {
		t.Fatal(err)
	}
	time.Sleep(10 * time.Millisecond)
	if _, err := a.CanList(ctx, gvrCM(), "team-a"); err != nil {
		t.Fatal(err)
	}
	if n := atomic.LoadInt32(count); n != 2 {
		t.Fatalf("SSAR count = %d, want 2 (cache expired between calls)", n)
	}
}

// TestCanListEmptyTokenHedge: no token ⇒ (true,nil) with NO SSAR (single
// operator / OIDC off).
func TestCanListEmptyTokenHedge(t *testing.T) {
	a, count := sarRig(t, defaultSARTTL, func(string) bool { return false })
	if ok, err := a.CanList(tokCtx("alice", ""), gvrCM(), "team-a"); err != nil || !ok {
		t.Fatalf("empty token: got (%v,%v), want (true,nil)", ok, err)
	}
	if n := atomic.LoadInt32(count); n != 0 {
		t.Fatalf("empty token issued %d SSARs, want 0", n)
	}
}

// TestCanListDifferentUsersDoNotShareCache: alice allowed, bob denied for the
// SAME namespace — the cache key includes the user, so bob is not served alice's
// decision.
func TestCanListDifferentUsersDoNotShareCache(t *testing.T) {
	// The clientFor builder returns a per-user fake clientset: alice's always
	// allows, bob's always denies. Because the cache key includes the user, bob's
	// query for the SAME namespace cannot be served alice's cached allow.
	var alice, bob int32
	build := func(token string) (kubernetes.Interface, error) {
		cs := kubefake.NewSimpleClientset()
		allow := token == "tok-alice"
		cs.PrependReactor("create", "selfsubjectaccessreviews",
			func(action kubetesting.Action) (bool, runtime.Object, error) {
				if allow {
					atomic.AddInt32(&alice, 1)
				} else {
					atomic.AddInt32(&bob, 1)
				}
				ssar := action.(kubetesting.CreateAction).GetObject().(*authzv1.SelfSubjectAccessReview)
				ssar.Status.Allowed = allow
				return true, ssar, nil
			})
		return cs, nil
	}
	az := &SSARAuthorizer{ttl: time.Hour, cache: map[string]sarDecision{}}
	az.clientFor = build

	if ok, err := az.CanList(tokCtx("alice", "tok-alice"), gvrCM(), "shared"); err != nil || !ok {
		t.Fatalf("alice: got (%v,%v), want (true,nil)", ok, err)
	}
	if ok, err := az.CanList(tokCtx("bob", "tok-bob"), gvrCM(), "shared"); err != nil || ok {
		t.Fatalf("bob: got (%v,%v), want (false,nil) — bob must not inherit alice's allow", ok, err)
	}
	if atomic.LoadInt32(&alice) != 1 || atomic.LoadInt32(&bob) != 1 {
		t.Fatalf("want one SSAR per user (alice=%d bob=%d)", alice, bob)
	}
}

// TestCanListNilRESTConfigFailsClosed: with a token present but no rest.Config,
// the default client builder fails CLOSED (false, err) rather than falling back
// to the ServiceAccount.
func TestCanListNilRESTConfigFailsClosed(t *testing.T) {
	// Accessor with no rest.Config (NewAccessorFrom leaves it nil).
	acc := NewAccessorFrom(nil, nil)
	a := NewSSARAuthorizer(acc) // uses the real buildClient
	ok, err := a.CanList(tokCtx("alice", "tok"), gvrCM(), "team-a")
	if ok {
		t.Fatal("nil RESTConfig + token must not allow")
	}
	if err == nil {
		t.Fatal("nil RESTConfig + token must return an error (fail closed)")
	}
}
