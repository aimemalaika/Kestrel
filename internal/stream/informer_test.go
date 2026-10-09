package stream

import (
	"context"
	"fmt"
	gort "runtime"
	"sync/atomic"
	"testing"
	"time"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/apimachinery/pkg/watch"
	"k8s.io/client-go/dynamic/fake"
	clienttesting "k8s.io/client-go/testing"
	"k8s.io/client-go/tools/cache"

	"github.com/aimemalaika/Kestrel/internal/k8s"
)

var cmGVR = schema.GroupVersionResource{Version: "v1", Resource: "configmaps"}
var cmRef = k8s.Ref{GVR: k8s.GVR{Version: "v1", Resource: "configmaps"}}

func cm(ns, name string) *unstructured.Unstructured {
	return &unstructured.Unstructured{Object: map[string]any{
		"apiVersion": "v1", "kind": "ConfigMap",
		"metadata": map[string]any{"namespace": ns, "name": name},
	}}
}

type rig struct {
	hub      *Hub
	client   *fake.FakeDynamicClient
	informs  atomic.Int32 // informers created
	watching chan struct{}
}

// newRig builds a Hub over a fake dynamic client. The watch reactor signals
// once the upstream watch is actually registered, so tests never race the
// fake's list->watch gap.
func newRig(t *testing.T, opts []HubOption, seed ...runtime.Object) *rig {
	t.Helper()
	sc := runtime.NewScheme()
	c := fake.NewSimpleDynamicClientWithCustomListKinds(sc,
		map[schema.GroupVersionResource]string{cmGVR: "ConfigMapList"}, seed...)
	r := &rig{client: c, watching: make(chan struct{}, 16)}
	c.PrependWatchReactor("*", func(a clienttesting.Action) (bool, watch.Interface, error) {
		w, err := c.Tracker().Watch(a.GetResource(), a.GetNamespace())
		if err == nil {
			r.watching <- struct{}{}
		}
		return true, w, err
	})
	r.hub = NewHub(c, opts...)
	inner := r.hub.newInforms
	r.hub.newInforms = func(g k8s.GVR) cache.SharedIndexInformer {
		r.informs.Add(1)
		return inner(g)
	}
	t.Cleanup(r.hub.Close)
	return r
}

func recv(t *testing.T, ch <-chan Envelope) Envelope {
	t.Helper()
	select {
	case e, ok := <-ch:
		if !ok {
			t.Fatal("channel closed unexpectedly")
		}
		return e
	case <-time.After(5 * time.Second):
		t.Fatal("timed out waiting for envelope")
	}
	return Envelope{}
}

func name(e Envelope) string {
	md, _ := e.Object["metadata"].(map[string]any)
	s, _ := md["name"].(string)
	return s
}

// burst reads n added envelopes (any order) then a bookmark.
func burst(t *testing.T, ch <-chan Envelope, want ...string) {
	t.Helper()
	got := map[string]bool{}
	for range want {
		e := recv(t, ch)
		if e.Type != Added {
			t.Fatalf("burst: want added, got %s", e.Type)
		}
		got[name(e)] = true
	}
	for _, w := range want {
		if !got[w] {
			t.Fatalf("burst missing %s (got %v)", w, got)
		}
	}
	if e := recv(t, ch); e.Type != Bookmark {
		t.Fatalf("want bookmark after burst, got %s", e.Type)
	}
}

// next skips duplicate-of-snapshot adds is NOT needed here; events are exact.
func expect(t *testing.T, ch <-chan Envelope, typ, nm string) {
	t.Helper()
	e := recv(t, ch)
	if e.Type != typ || name(e) != nm {
		t.Fatalf("want %s %s, got %s %s", typ, nm, e.Type, name(e))
	}
}

func waitWatch(t *testing.T, r *rig) {
	t.Helper()
	select {
	case <-r.watching:
	case <-time.After(5 * time.Second):
		t.Fatal("upstream watch never established")
	}
}

func closed(ch <-chan Envelope) bool {
	deadline := time.After(5 * time.Second)
	for {
		select {
		case _, ok := <-ch:
			if !ok {
				return true
			}
		case <-deadline:
			return false
		}
	}
}

func TestInitialSyncThenBookmark(t *testing.T) {
	r := newRig(t, nil, cm("a", "one"), cm("b", "two"))
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	ch, err := r.hub.Watch(ctx, cmRef)
	if err != nil {
		t.Fatal(err)
	}
	burst(t, ch, "one", "two")
}

func TestLiveDeltas(t *testing.T) {
	r := newRig(t, nil, cm("a", "one"))
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	ch, err := r.hub.Watch(ctx, cmRef)
	if err != nil {
		t.Fatal(err)
	}
	burst(t, ch, "one")
	waitWatch(t, r)
	res := r.client.Resource(cmGVR).Namespace("a")

	if _, err := res.Create(ctx, cm("a", "two"), metav1.CreateOptions{}); err != nil {
		t.Fatal(err)
	}
	expect(t, ch, Added, "two")

	u := cm("a", "two")
	u.SetLabels(map[string]string{"x": "y"})
	if _, err := res.Update(ctx, u, metav1.UpdateOptions{}); err != nil {
		t.Fatal(err)
	}
	expect(t, ch, Modified, "two")

	if err := res.Delete(ctx, "two", metav1.DeleteOptions{}); err != nil {
		t.Fatal(err)
	}
	expect(t, ch, Deleted, "two")
}

func TestFanOutTwoSubscribersOneInformer(t *testing.T) {
	r := newRig(t, nil, cm("a", "one"))
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	c1, err := r.hub.Watch(ctx, cmRef)
	if err != nil {
		t.Fatal(err)
	}
	c2, err := r.hub.Watch(ctx, cmRef)
	if err != nil {
		t.Fatal(err)
	}
	burst(t, c1, "one")
	burst(t, c2, "one")
	waitWatch(t, r)

	if _, err := r.client.Resource(cmGVR).Namespace("a").Create(ctx, cm("a", "two"), metav1.CreateOptions{}); err != nil {
		t.Fatal(err)
	}
	expect(t, c1, Added, "two")
	expect(t, c2, Added, "two")

	if n := r.informs.Load(); n != 1 {
		t.Fatalf("want exactly 1 shared informer, got %d", n)
	}
	select {
	case <-r.watching:
		t.Fatal("a second upstream watch was opened")
	case <-time.After(200 * time.Millisecond):
	}
}

func TestNamespaceFilter(t *testing.T) {
	r := newRig(t, nil, cm("a", "in-a"), cm("b", "in-b"))
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	ref := cmRef
	ref.Namespace = "a"
	ch, err := r.hub.Watch(ctx, ref)
	if err != nil {
		t.Fatal(err)
	}
	burst(t, ch, "in-a") // in-b filtered from the snapshot
	waitWatch(t, r)
	if _, err := r.client.Resource(cmGVR).Namespace("b").Create(ctx, cm("b", "new-b"), metav1.CreateOptions{}); err != nil {
		t.Fatal(err)
	}
	if _, err := r.client.Resource(cmGVR).Namespace("a").Create(ctx, cm("a", "new-a"), metav1.CreateOptions{}); err != nil {
		t.Fatal(err)
	}
	// new-b was created first; the next envelope must be new-a, never new-b.
	expect(t, ch, Added, "new-a")
}

func TestCancelClosesChannelAndStopsInformer(t *testing.T) {
	before := gort.NumGoroutine()
	r := newRig(t, nil, cm("a", "one"))
	ctx, cancel := context.WithCancel(context.Background())
	ch, err := r.hub.Watch(ctx, cmRef)
	if err != nil {
		t.Fatal(err)
	}
	burst(t, ch, "one")
	cancel()
	if !closed(ch) {
		t.Fatal("channel not closed after cancel")
	}
	// Last subscriber left: entry removed and informer stopped.
	waitFor(t, func() bool {
		r.hub.mu.Lock()
		defer r.hub.mu.Unlock()
		return len(r.hub.entries) == 0
	})
	r.hub.Close() // waits for informer goroutines
	waitFor(t, func() bool { return gort.NumGoroutine() <= before })
}

func TestCancelOneKeepsOtherAndInformer(t *testing.T) {
	r := newRig(t, nil, cm("a", "one"))
	ctx1, cancel1 := context.WithCancel(context.Background())
	ctx2, cancel2 := context.WithCancel(context.Background())
	defer cancel2()
	c1, _ := r.hub.Watch(ctx1, cmRef)
	c2, _ := r.hub.Watch(ctx2, cmRef)
	burst(t, c1, "one")
	burst(t, c2, "one")
	waitWatch(t, r)
	cancel1()
	if !closed(c1) {
		t.Fatal("c1 not closed")
	}
	if _, err := r.client.Resource(cmGVR).Namespace("a").Create(ctx2, cm("a", "two"), metav1.CreateOptions{}); err != nil {
		t.Fatal(err)
	}
	expect(t, c2, Added, "two")
	if n := r.informs.Load(); n != 1 {
		t.Fatalf("informers=%d", n)
	}
}

func TestSlowSubscriberDisconnectedOthersUnaffected(t *testing.T) {
	r := newRig(t, []HubOption{WithSubscriberBuffer(2)}, cm("a", "seed"))
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	slow, _ := r.hub.Watch(ctx, cmRef) // never read until the end
	fast, _ := r.hub.Watch(ctx, cmRef)
	burst(t, fast, "seed")
	waitWatch(t, r)

	done := make(chan struct{})
	got := make(chan string, 64)
	go func() { // fast consumer
		defer close(done)
		for e := range fast {
			got <- name(e)
		}
	}()
	for i := 0; i < 20; i++ {
		n := fmt.Sprintf("o%d", i)
		if _, err := r.client.Resource(cmGVR).Namespace("a").Create(ctx, cm("a", n), metav1.CreateOptions{}); err != nil {
			t.Fatal(err)
		}
	}
	for i := 0; i < 20; i++ { // fast sees everything despite the stuck peer
		select {
		case <-got:
		case <-time.After(5 * time.Second):
			t.Fatalf("fast subscriber starved at %d", i)
		}
	}
	// The slow one is eventually terminated with an error envelope then closed.
	sawErr := false
	for e := range slow {
		if e.Type == Error {
			sawErr = true
		}
	}
	if !sawErr {
		t.Fatal("slow subscriber closed without an error envelope")
	}
	cancel()
	<-done
}

func TestUnknownResourceResolverError(t *testing.T) {
	r := newRig(t, []HubOption{WithResolver(func(k8s.GVR) error { return k8s.NotFound("nope") })})
	if _, err := r.hub.Watch(context.Background(), cmRef); err == nil {
		t.Fatal("want error")
	}
	if r.informs.Load() != 0 {
		t.Fatal("informer created for unresolvable GVR")
	}
}

func waitFor(t *testing.T, cond func() bool) {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		if cond() {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatal("condition not met in time")
}

// Guards the invariant that snapshot objects are deep-copied: mutating one
// subscriber's initial-burst object must not affect another subscriber's.
func TestSnapshotObjectsAreDeepCopied(t *testing.T) {
	r := newRig(t, nil, cm("default", "a"))
	ctx := context.Background()
	ch1, err := r.hub.Watch(ctx, cmRef)
	if err != nil {
		t.Fatal(err)
	}
	ch2, err := r.hub.Watch(ctx, cmRef)
	if err != nil {
		t.Fatal(err)
	}
	e1 := recv(t, ch1)
	if e1.Type != Added || name(e1) != "a" {
		t.Fatalf("sub1 want added a, got %v/%s", e1.Type, name(e1))
	}
	// Mutate sub1's copy; sub2 must still see the original.
	e1.Object["metadata"].(map[string]any)["name"] = "MUTATED"
	e2 := recv(t, ch2)
	if e2.Type != Added || name(e2) != "a" {
		t.Fatalf("snapshot object aliased across subscribers: sub2 got %v/%s", e2.Type, name(e2))
	}
}

// Name filter: a subscriber scoped to a single object name receives only that
// object in both the initial burst and live deltas.
func TestNameFilter(t *testing.T) {
	ref := cmRef
	ref.Name = "keep"
	r := newRig(t, []HubOption{}, cm("default", "keep"), cm("default", "drop"))
	ctx := context.Background()
	ch, err := r.hub.Watch(ctx, ref)
	if err != nil {
		t.Fatal(err)
	}
	if e := recv(t, ch); e.Type != Added || name(e) != "keep" {
		t.Fatalf("want added keep, got %v/%s", e.Type, name(e))
	}
	if e := recv(t, ch); e.Type != Bookmark {
		t.Fatalf("want bookmark, got %v", e.Type)
	}
	<-r.watching
	// Delete the non-matching object (filtered out) then the matching one.
	nc := r.client.Resource(cmGVR).Namespace("default")
	if err := nc.Delete(ctx, "drop", metav1.DeleteOptions{}); err != nil {
		t.Fatal(err)
	}
	if err := nc.Delete(ctx, "keep", metav1.DeleteOptions{}); err != nil {
		t.Fatal(err)
	}
	if e := recv(t, ch); e.Type != Deleted || name(e) != "keep" {
		t.Fatalf("name filter leaked a non-matching delta: got %v/%s", e.Type, name(e))
	}
}
