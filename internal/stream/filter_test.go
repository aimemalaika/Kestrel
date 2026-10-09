package stream

import (
	"context"
	"fmt"
	"strings"
	"testing"
	"time"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	"github.com/aimemalaika/Kestrel/internal/auth"
	"github.com/aimemalaika/Kestrel/internal/k8s"
)

// fakeAuthz is a per-user namespace allow-list. It reads the identity off ctx
// (exactly as the real SSARAuthorizer does), so the Hub's requirement that the
// check run in the subscriber's own goroutine/ctx is exercised. When err is set
// every check returns an error (to prove fail-closed).
type fakeAuthz struct {
	allow map[string]map[string]bool // user -> namespace -> allowed
	err   error
}

func (f *fakeAuthz) CanList(ctx context.Context, _ k8s.GVR, ns string) (bool, error) {
	if f.err != nil {
		return false, f.err
	}
	user := auth.From(ctx).User
	return f.allow[user][ns], nil
}

func idCtx(user, token string) (context.Context, context.CancelFunc) {
	return context.WithCancel(auth.WithIdentity(context.Background(),
		auth.Identity{User: user, Token: token}))
}

// collectBurst reads Added envelopes up to the Bookmark and returns the set of
// names seen in the initial snapshot. It fails on any non-Added/Bookmark type —
// an Added for an unexpected name is exactly a cross-user leak the caller checks.
func collectBurst(t *testing.T, ch <-chan Envelope) map[string]bool {
	t.Helper()
	got := map[string]bool{}
	for {
		e := recv(t, ch)
		switch e.Type {
		case Added:
			got[name(e)] = true
		case Bookmark:
			return got
		default:
			t.Fatalf("unexpected envelope type %q in burst", e.Type)
		}
	}
}

// TestTwoUserDisjointRBACIsolation is the headline leak-prevention test. alice
// may list only team-a, bob only team-b; team-c is off-limits to both. Both open
// an all-namespaces watch over ONE shared informer. We assert each user's
// initial snapshot AND each user's live create/update/delete deltas are confined
// to their own namespace — proving no cross-user leak on either path.
func TestTwoUserDisjointRBACIsolation(t *testing.T) {
	az := &fakeAuthz{allow: map[string]map[string]bool{
		"alice": {"team-a": true},
		"bob":   {"team-b": true},
	}}
	r := newRig(t, []HubOption{WithAuthorizer(az)},
		cm("team-a", "a-seed"), cm("team-b", "b-seed"), cm("team-c", "c-seed"))

	aliceCtx, aliceCancel := idCtx("alice", "tok-alice")
	defer aliceCancel()
	bobCtx, bobCancel := idCtx("bob", "tok-bob")
	defer bobCancel()

	aliceCh, err := r.hub.Watch(aliceCtx, cmRef)
	if err != nil {
		t.Fatal(err)
	}
	bobCh, err := r.hub.Watch(bobCtx, cmRef)
	if err != nil {
		t.Fatal(err)
	}

	// Initial sync: disjoint, and neither sees team-c.
	if snap := collectBurst(t, aliceCh); !snap["a-seed"] || len(snap) != 1 {
		t.Fatalf("alice snapshot = %v, want only {a-seed}", snap)
	}
	if snap := collectBurst(t, bobCh); !snap["b-seed"] || len(snap) != 1 {
		t.Fatalf("bob snapshot = %v, want only {b-seed}", snap)
	}

	// One shared informer serves both users.
	if n := r.informs.Load(); n != 1 {
		t.Fatalf("want 1 shared informer, got %d", n)
	}
	waitWatch(t, r)

	// Live deltas across all three namespaces. alice must see ONLY team-a deltas;
	// bob ONLY team-b. team-c is forbidden to both.
	teamA := r.client.Resource(cmGVR).Namespace("team-a")
	teamB := r.client.Resource(cmGVR).Namespace("team-b")
	teamC := r.client.Resource(cmGVR).Namespace("team-c")

	if _, err := teamA.Create(aliceCtx, cm("team-a", "a-live"), metav1.CreateOptions{}); err != nil {
		t.Fatal(err)
	}
	if _, err := teamB.Create(bobCtx, cm("team-b", "b-live"), metav1.CreateOptions{}); err != nil {
		t.Fatal(err)
	}
	if _, err := teamC.Create(aliceCtx, cm("team-c", "c-live"), metav1.CreateOptions{}); err != nil {
		t.Fatal(err)
	}

	au := cm("team-a", "a-live")
	au.SetLabels(map[string]string{"x": "y"})
	if _, err := teamA.Update(aliceCtx, au, metav1.UpdateOptions{}); err != nil {
		t.Fatal(err)
	}
	if err := teamA.Delete(aliceCtx, "a-live", metav1.DeleteOptions{}); err != nil {
		t.Fatal(err)
	}

	bu := cm("team-b", "b-live")
	bu.SetLabels(map[string]string{"x": "y"})
	if _, err := teamB.Update(bobCtx, bu, metav1.UpdateOptions{}); err != nil {
		t.Fatal(err)
	}
	if err := teamB.Delete(bobCtx, "b-live", metav1.DeleteOptions{}); err != nil {
		t.Fatal(err)
	}

	// alice's live stream: exactly a-live added/modified/deleted, never b-live or
	// c-live. A leak would surface as a wrong name here (c-live/b-live arriving
	// before or instead of the expected a-live delta).
	expect(t, aliceCh, Added, "a-live")
	expect(t, aliceCh, Modified, "a-live")
	expect(t, aliceCh, Deleted, "a-live")

	// bob's live stream: exactly b-live. team-a deltas and c-live are filtered out
	// of bob's channel, so the first thing bob sees is b-live.
	expect(t, bobCh, Added, "b-live")
	expect(t, bobCh, Modified, "b-live")
	expect(t, bobCh, Deleted, "b-live")
}

// TestSlowSubscriberDrainStaysFiltered exercises the highest-risk path: when a
// subscriber overflows its buffer and is force-resynced, the objects DRAINED
// from its backlog must still be per-user filtered. alice may list only team-a;
// we flood forbidden team-b objects while she is unread to overflow her buffer
// and kick her onto the drain path, then read everything she gets and assert no
// team-b object ever leaks — only her allowed snapshot and the resync Error.
func TestSlowSubscriberDrainStaysFiltered(t *testing.T) {
	az := &fakeAuthz{allow: map[string]map[string]bool{"alice": {"team-a": true}}}
	r := newRig(t, []HubOption{WithAuthorizer(az), WithSubscriberBuffer(2)}, cm("team-a", "a-seed"))
	ctx, cancel := idCtx("alice", "tok-alice")
	defer cancel()

	ch, err := r.hub.Watch(ctx, cmRef) // deliberately unread until the flood is queued
	if err != nil {
		t.Fatal(err)
	}
	waitWatch(t, r)

	// Flood forbidden team-b objects while alice is unread, overflowing her buffer
	// (2) so the hub kicks her onto the drain/resync path.
	for i := 0; i < 20; i++ {
		if _, err := r.client.Resource(cmGVR).Namespace("team-b").Create(
			ctx, cm("team-b", fmt.Sprintf("b%d", i)), metav1.CreateOptions{}); err != nil {
			t.Fatal(err)
		}
	}

	// Read everything alice receives until the channel closes. She must see her
	// allowed snapshot (a-seed) and an Error (resync), and NEVER a team-b object —
	// a leak would surface here as a "b<N>" name on the drain path.
	sawSeed, sawErr := false, false
	for e := range ch {
		switch e.Type {
		case Error:
			sawErr = true
		case Bookmark:
			// metadata only
		default:
			nm := name(e)
			if strings.HasPrefix(nm, "b") {
				t.Fatalf("LEAK: forbidden team-b object %q delivered on the drain path", nm)
			}
			if nm == "a-seed" {
				sawSeed = true
			}
		}
	}
	if !sawSeed {
		t.Error("alice did not receive her own allowed snapshot object")
	}
	if !sawErr {
		t.Error("slow subscriber closed without an Error (resync) envelope")
	}
}

// TestFilterFailClosed: an authorizer that errors on every check ⇒ the user sees
// NO objects (snapshot empty), but the stream does not break — the bookmark is
// still delivered and a later live delta is simply filtered out.
func TestFilterFailClosed(t *testing.T) {
	az := &fakeAuthz{err: fmt.Errorf("boom")}
	r := newRig(t, []HubOption{WithAuthorizer(az)}, cm("team-a", "one"), cm("team-b", "two"))
	ctx, cancel := idCtx("alice", "tok")
	defer cancel()
	ch, err := r.hub.Watch(ctx, cmRef)
	if err != nil {
		t.Fatal(err)
	}
	// No Added envelopes; the first (and only pre-delta) envelope is the bookmark.
	if e := recv(t, ch); e.Type != Bookmark {
		t.Fatalf("fail-closed: want bookmark with no objects, got %s %s", e.Type, name(e))
	}
	waitWatch(t, r)
	if _, err := r.client.Resource(cmGVR).Namespace("team-a").Create(ctx, cm("team-a", "three"), metav1.CreateOptions{}); err != nil {
		t.Fatal(err)
	}
	select {
	case e, ok := <-ch:
		if ok {
			t.Fatalf("fail-closed leaked a live delta: %s %s", e.Type, name(e))
		}
	case <-time.After(200 * time.Millisecond):
		// Good: nothing delivered, channel still open.
	}
}

// TestHedgeNilAuthorizer: no authorizer ⇒ all objects delivered (today's
// behavior), even with a user token on ctx.
func TestHedgeNilAuthorizer(t *testing.T) {
	r := newRig(t, nil, cm("team-a", "one"), cm("team-b", "two"))
	ctx, cancel := idCtx("alice", "tok")
	defer cancel()
	ch, err := r.hub.Watch(ctx, cmRef)
	if err != nil {
		t.Fatal(err)
	}
	burst(t, ch, "one", "two")
}

// TestHedgeEmptyToken: authorizer present but the connection has no token (OIDC
// off) ⇒ filtering OFF, all objects delivered.
func TestHedgeEmptyToken(t *testing.T) {
	az := &fakeAuthz{allow: map[string]map[string]bool{}} // would deny everything if consulted
	r := newRig(t, []HubOption{WithAuthorizer(az)}, cm("team-a", "one"), cm("team-b", "two"))
	ctx, cancel := idCtx("alice", "") // empty token
	defer cancel()
	ch, err := r.hub.Watch(ctx, cmRef)
	if err != nil {
		t.Fatal(err)
	}
	burst(t, ch, "one", "two")
}

// TestBookmarkNeverFiltered: a deny-all authorizer must not swallow the
// bookmark. (The Error envelope's unfiltered delivery is covered end-to-end by
// TestSlowSubscriberDisconnectedOthersUnaffected.)
func TestBookmarkNeverFiltered(t *testing.T) {
	az := &fakeAuthz{allow: map[string]map[string]bool{"alice": {}}} // denies every namespace
	r := newRig(t, []HubOption{WithAuthorizer(az)}, cm("team-a", "seed"), cm("team-b", "seed2"))
	ctx, cancel := idCtx("alice", "tok")
	defer cancel()
	ch, err := r.hub.Watch(ctx, cmRef)
	if err != nil {
		t.Fatal(err)
	}
	if e := recv(t, ch); e.Type != Bookmark {
		t.Fatalf("want bookmark (never filtered) with all objects denied, got %s %s", e.Type, name(e))
	}
}
