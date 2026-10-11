package k8s

import (
	"log/slog"
	"sync"
	"time"

	"k8s.io/apimachinery/pkg/api/meta"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/restmapper"
)

// defaultResetCooldown bounds how often resettingMapper will invalidate
// discovery in response to NoMatch misses, so a flood of lookups for a
// genuinely-absent resource cannot hammer the apiserver's discovery endpoint.
const defaultResetCooldown = 20 * time.Second

// resettingMapper wraps a *restmapper.DeferredDiscoveryRESTMapper and makes
// post-startup CRDs resolvable without a Kestrel restart.
//
// The mem-cached discovery behind the deferred mapper is populated once at
// startup and reports itself Fresh afterwards, so the deferred mapper's own
// self-reset (which only fires when the cache is NOT fresh) never triggers for
// a CRD installed after Kestrel started: its lookups keep returning a NoMatch
// error forever. resettingMapper closes that gap: on any lookup that returns a
// NoMatch error it invalidates discovery (DeferredDiscoveryRESTMapper.Reset,
// which calls Invalidate() on the CachedDiscoveryInterface and drops the
// delegate so the next lookup re-discovers) and retries the lookup ONCE.
//
// The reset is cooldown-gated (maybeReset): two misses inside the cooldown
// window perform at most one invalidation, so a steady stream of misses for a
// resource that really does not exist cannot stampede discovery. The underlying
// Reset() is itself concurrency-safe (DeferredDiscoveryRESTMapper has an
// internal mutex); only the cooldown bookkeeping needs this wrapper's mutex.
type resettingMapper struct {
	deferred *restmapper.DeferredDiscoveryRESTMapper

	cooldown time.Duration
	now      func() time.Time // injectable clock (tests advance it without sleeping)

	mu        sync.Mutex
	lastReset time.Time
}

// newResettingMapper wraps d with the default cooldown and the real clock.
func newResettingMapper(d *restmapper.DeferredDiscoveryRESTMapper) *resettingMapper {
	return &resettingMapper{
		deferred: d,
		cooldown: defaultResetCooldown,
		now:      time.Now,
	}
}

var _ meta.RESTMapper = (*resettingMapper)(nil)

// maybeReset invalidates the deferred mapper's discovery cache if the cooldown
// has elapsed since the last reset, and reports whether a reset actually fired.
// A reset within the cooldown window is skipped (returns false) so repeated
// misses for an absent resource cannot hammer discovery.
func (r *resettingMapper) maybeReset() bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	now := r.now()
	if !r.lastReset.IsZero() && now.Sub(r.lastReset) < r.cooldown {
		return false // too soon since the last reset
	}
	r.deferred.Reset()
	r.lastReset = now
	return true
}

// reretry runs call; on a NoMatch error it attempts a cooldown-gated discovery
// reset and, only if a reset actually fired, retries call once and returns that
// result. Otherwise the original result/err is returned unchanged. A reset is
// logged (once per actual reset, never per miss) with the key that missed.
func reretry[T any](call func() (T, error), r *resettingMapper, key any) (T, error) {
	v, err := call()
	if err == nil || !meta.IsNoMatchError(err) {
		return v, err
	}
	if !r.maybeReset() {
		return v, err
	}
	slog.Info("restmapper: discovery invalidated after no-match; retrying (post-startup CRD refresh)",
		slog.Any("key", key))
	return call()
}

func (r *resettingMapper) KindFor(resource schema.GroupVersionResource) (schema.GroupVersionKind, error) {
	return reretry(func() (schema.GroupVersionKind, error) { return r.deferred.KindFor(resource) }, r, resource)
}

func (r *resettingMapper) KindsFor(resource schema.GroupVersionResource) ([]schema.GroupVersionKind, error) {
	return reretry(func() ([]schema.GroupVersionKind, error) { return r.deferred.KindsFor(resource) }, r, resource)
}

func (r *resettingMapper) ResourceFor(input schema.GroupVersionResource) (schema.GroupVersionResource, error) {
	return reretry(func() (schema.GroupVersionResource, error) { return r.deferred.ResourceFor(input) }, r, input)
}

func (r *resettingMapper) ResourcesFor(input schema.GroupVersionResource) ([]schema.GroupVersionResource, error) {
	return reretry(func() ([]schema.GroupVersionResource, error) { return r.deferred.ResourcesFor(input) }, r, input)
}

func (r *resettingMapper) RESTMapping(gk schema.GroupKind, versions ...string) (*meta.RESTMapping, error) {
	return reretry(func() (*meta.RESTMapping, error) { return r.deferred.RESTMapping(gk, versions...) }, r, gk)
}

func (r *resettingMapper) RESTMappings(gk schema.GroupKind, versions ...string) ([]*meta.RESTMapping, error) {
	return reretry(func() ([]*meta.RESTMapping, error) { return r.deferred.RESTMappings(gk, versions...) }, r, gk)
}

func (r *resettingMapper) ResourceSingularizer(resource string) (string, error) {
	return reretry(func() (string, error) { return r.deferred.ResourceSingularizer(resource) }, r, resource)
}
