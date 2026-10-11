package k8s

import (
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"k8s.io/apimachinery/pkg/api/meta"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/discovery"
	"k8s.io/client-go/restmapper"
)

// fakeCachedDiscovery is a minimal discovery.CachedDiscoveryInterface for
// driving a DeferredDiscoveryRESTMapper. Its resource set starts WITHOUT the
// CRD and gains it only once Invalidate() is called — modelling a CRD that is
// installed after Kestrel (and its discovery cache) started. It always reports
// Fresh()==true so the deferred mapper's own self-reset (which fires only on a
// non-fresh cache) never triggers: resettingMapper is the sole thing that can
// invalidate, which is exactly what we are exercising.
type fakeCachedDiscovery struct {
	discovery.DiscoveryInterface // unused methods; nil is fine (never called here)

	mu         sync.Mutex
	invalidate int32 // count of Invalidate() calls (atomic for the race test)
	hasCRD     bool  // flips true on the first Invalidate
}

func (f *fakeCachedDiscovery) Fresh() bool { return true }

func (f *fakeCachedDiscovery) Invalidate() {
	atomic.AddInt32(&f.invalidate, 1)
	f.mu.Lock()
	f.hasCRD = true
	f.mu.Unlock()
}

func (f *fakeCachedDiscovery) invalidateCount() int { return int(atomic.LoadInt32(&f.invalidate)) }

func (f *fakeCachedDiscovery) ServerGroupsAndResources() ([]*metav1.APIGroup, []*metav1.APIResourceList, error) {
	f.mu.Lock()
	hasCRD := f.hasCRD
	f.mu.Unlock()

	groups := []*metav1.APIGroup{
		{
			Name:             "",
			Versions:         []metav1.GroupVersionForDiscovery{{GroupVersion: "v1", Version: "v1"}},
			PreferredVersion: metav1.GroupVersionForDiscovery{GroupVersion: "v1", Version: "v1"},
		},
	}
	resources := []*metav1.APIResourceList{
		{
			GroupVersion: "v1",
			APIResources: []metav1.APIResource{
				{Name: "pods", Namespaced: true, Kind: "Pod"},
			},
		},
	}
	if hasCRD {
		groups = append(groups, &metav1.APIGroup{
			Name:             "example.com",
			Versions:         []metav1.GroupVersionForDiscovery{{GroupVersion: "example.com/v1", Version: "v1"}},
			PreferredVersion: metav1.GroupVersionForDiscovery{GroupVersion: "example.com/v1", Version: "v1"},
		})
		resources = append(resources, &metav1.APIResourceList{
			GroupVersion: "example.com/v1",
			APIResources: []metav1.APIResource{
				{Name: "widgets", Namespaced: true, Kind: "Widget"},
			},
		})
	}
	return groups, resources, nil
}

func newTestMapper(f *fakeCachedDiscovery) *resettingMapper {
	m := newResettingMapper(restmapper.NewDeferredDiscoveryRESTMapper(f))
	m.cooldown = 20 * time.Second
	return m
}

var (
	widgetGVR = schema.GroupVersionResource{Group: "example.com", Version: "v1", Resource: "widgets"}
	widgetGK  = schema.GroupKind{Group: "example.com", Kind: "Widget"}
	ghostGVR  = schema.GroupVersionResource{Group: "example.com", Version: "v1", Resource: "ghosts"}
)

// Post-startup CRD becomes resolvable without recreating the mapper: the raw
// deferred mapper keeps returning NoMatch (its cache is Fresh), but the first
// resettingMapper lookup resets discovery and resolves on the retry.
func TestResettingMapper_PostStartupCRDResolves(t *testing.T) {
	f := &fakeCachedDiscovery{}
	m := newTestMapper(f)

	// The underlying deferred mapper cannot see the CRD and never self-resets
	// (cache is Fresh), so it returns NoMatch and leaves hasCRD false.
	if _, err := m.deferred.KindFor(widgetGVR); !meta.IsNoMatchError(err) {
		t.Fatalf("deferred KindFor(widgets): want NoMatch, got %v", err)
	}
	if f.invalidateCount() != 0 {
		t.Fatalf("deferred lookup must not invalidate (cache Fresh); got %d", f.invalidateCount())
	}

	// The wrapper resets discovery on the NoMatch and resolves on the retry.
	gvk, err := m.KindFor(widgetGVR)
	if err != nil {
		t.Fatalf("resettingMapper KindFor(widgets): %v", err)
	}
	if gvk.Kind != "Widget" {
		t.Fatalf("KindFor(widgets) kind = %q, want Widget", gvk.Kind)
	}
	if f.invalidateCount() != 1 {
		t.Fatalf("want exactly 1 invalidate, got %d", f.invalidateCount())
	}

	// RESTMapping for the CRD now resolves too (no further reset needed).
	mp, err := m.RESTMapping(widgetGK, "v1")
	if err != nil {
		t.Fatalf("RESTMapping(Widget): %v", err)
	}
	if mp.Resource != widgetGVR {
		t.Fatalf("RESTMapping resource = %v, want %v", mp.Resource, widgetGVR)
	}
	if f.invalidateCount() != 1 {
		t.Fatalf("resolved lookup must not add resets, got %d", f.invalidateCount())
	}
}

// RESTMapping specifically drives the reset+retry path too.
func TestResettingMapper_RESTMappingResolvesAfterReset(t *testing.T) {
	f := &fakeCachedDiscovery{}
	m := newTestMapper(f)

	if _, err := m.deferred.RESTMapping(widgetGK, "v1"); !meta.IsNoMatchError(err) {
		t.Fatalf("deferred RESTMapping: want NoMatch, got %v", err)
	}
	mp, err := m.RESTMapping(widgetGK, "v1")
	if err != nil {
		t.Fatalf("RESTMapping after reset: %v", err)
	}
	if mp.Resource != widgetGVR {
		t.Fatalf("resource = %v, want %v", mp.Resource, widgetGVR)
	}
	if f.invalidateCount() != 1 {
		t.Fatalf("want 1 invalidate, got %d", f.invalidateCount())
	}
}

// Cooldown: repeated misses for a genuinely-absent resource reset at most once
// per cooldown window; advancing the clock past the cooldown allows another.
func TestResettingMapper_CooldownDedupesResets(t *testing.T) {
	f := &fakeCachedDiscovery{}
	m := newTestMapper(f)

	clock := time.Unix(0, 0)
	m.now = func() time.Time { return clock }

	// First miss for a resource that never exists: one reset.
	if _, err := m.KindFor(ghostGVR); !meta.IsNoMatchError(err) {
		t.Fatalf("KindFor(ghosts): want NoMatch, got %v", err)
	}
	if f.invalidateCount() != 1 {
		t.Fatalf("after first miss want 1 invalidate, got %d", f.invalidateCount())
	}

	// Second miss inside the cooldown window: NO additional reset.
	if _, err := m.KindFor(ghostGVR); !meta.IsNoMatchError(err) {
		t.Fatalf("KindFor(ghosts) #2: want NoMatch, got %v", err)
	}
	if f.invalidateCount() != 1 {
		t.Fatalf("second miss within cooldown must not reset again; got %d", f.invalidateCount())
	}

	// Advance the clock past the cooldown: another miss resets again.
	clock = clock.Add(m.cooldown + time.Second)
	if _, err := m.KindFor(ghostGVR); !meta.IsNoMatchError(err) {
		t.Fatalf("KindFor(ghosts) #3: want NoMatch, got %v", err)
	}
	if f.invalidateCount() != 2 {
		t.Fatalf("after cooldown elapsed want 2 invalidates, got %d", f.invalidateCount())
	}
}

// A successful lookup (no NoMatch) never triggers a reset.
func TestResettingMapper_SuccessNoReset(t *testing.T) {
	f := &fakeCachedDiscovery{}
	m := newTestMapper(f)

	podsGVR := schema.GroupVersionResource{Group: "", Version: "v1", Resource: "pods"}
	for i := 0; i < 5; i++ {
		gvk, err := m.KindFor(podsGVR)
		if err != nil {
			t.Fatalf("KindFor(pods): %v", err)
		}
		if gvk.Kind != "Pod" {
			t.Fatalf("KindFor(pods) kind = %q, want Pod", gvk.Kind)
		}
	}
	if f.invalidateCount() != 0 {
		t.Fatalf("successful lookups must never reset, got %d", f.invalidateCount())
	}
}

// Race-safe: hammer KindFor from many goroutines under -race.
func TestResettingMapper_ConcurrentKindFor(t *testing.T) {
	f := &fakeCachedDiscovery{}
	m := newTestMapper(f)

	const n = 32
	var wg sync.WaitGroup
	wg.Add(n)
	for i := 0; i < n; i++ {
		go func() {
			defer wg.Done()
			for j := 0; j < 50; j++ {
				_, _ = m.KindFor(widgetGVR) // may miss then resolve; just must not race
				_, _ = m.KindFor(ghostGVR)  // always misses
			}
		}()
	}
	wg.Wait()

	// After the storm the CRD must be resolvable.
	if _, err := m.KindFor(widgetGVR); err != nil {
		t.Fatalf("KindFor(widgets) after concurrent storm: %v", err)
	}
}
