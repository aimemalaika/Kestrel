package stream

import (
	"context"
	"fmt"
	"log"
	"strconv"
	"sync"
	"time"

	"k8s.io/apimachinery/pkg/api/meta"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/dynamic/dynamicinformer"
	"k8s.io/client-go/tools/cache"

	"github.com/aimemalaika/Kestrel/internal/k8s"
)

// Defaults for Hub tuning.
const (
	// DefaultSubscriberBuffer is the per-subscriber live-delta queue depth.
	DefaultSubscriberBuffer = 1024
	// DefaultSyncTimeout bounds how long Watch waits for an informer's first sync.
	DefaultSyncTimeout = 30 * time.Second
)

// Hub is a stream.Source backed by ONE shared dynamic informer per GVR, fanned
// out to any number of SSE subscribers.
//
// Sharing: entries (informer + subscriber set) live in a map guarded by mu and
// are created lazily by the first subscriber of a GVR. Every later subscriber
// of that GVR reuses the same informer, so the upstream cost is a single
// list+watch per type no matter how many clients are connected. Dynamic
// informers cover every kind, CRDs included.
//
// Fan-out: a single ResourceEventHandler is registered per entry, once. It
// takes the entry lock, and does a NON-BLOCKING send into each subscriber's
// buffered queue, so a stuck client can never stall the informer or other
// clients.
//
// Slow-subscriber policy: if a subscriber's queue is full, that subscriber is
// DISCONNECTED: it is removed from the set and, after it drains what it already
// has, receives one `error` envelope ("subscriber too slow; resync") and its
// channel closes. The client then reconnects and gets a fresh initial burst,
// which is the correct resync. (Dropping individual events would silently
// diverge the client's view.)
//
// Lifecycle: subscribers are ref-counted per GVR. When the last one leaves the
// informer is stopped and the entry removed (no idle watches, no leaked
// goroutines); the next subscriber recreates it. Acquire/release happen under
// mu so an entry can never be revived after it was stopped.
//
// Relist / 410 Gone / bookmarks (#40): client-go's reflector inside the shared
// informer re-lists on a dropped watch or `410 Gone` and reconciles the store
// (emitting the right add/update/delete deltas to our handler), so none of that
// is hand-rolled here. After the initial sync we emit a `bookmark` carrying the
// informer's last-synced resourceVersion.
type Hub struct {
	dyn        dynamic.Interface
	resolve    func(k8s.GVR) error
	bufSize    int
	syncTO     time.Duration
	newInforms func(k8s.GVR) cache.SharedIndexInformer // overridable; counts creations in tests

	mu      sync.Mutex
	entries map[k8s.GVR]*entry
	closed  bool
	wg      sync.WaitGroup // informer goroutines
}

// HubOption customises a Hub.
type HubOption func(*Hub)

// WithResolver sets a GVR validator (e.g. discovery/RESTMapper lookup). Watch
// returns its error for unknown resources instead of waiting for a sync that
// would never complete. Optional; tests with fakes omit it.
func WithResolver(f func(k8s.GVR) error) HubOption { return func(h *Hub) { h.resolve = f } }

// WithSubscriberBuffer sets the per-subscriber live queue depth.
func WithSubscriberBuffer(n int) HubOption {
	return func(h *Hub) {
		if n > 0 {
			h.bufSize = n
		}
	}
}

// WithSyncTimeout sets the first-sync timeout.
func WithSyncTimeout(d time.Duration) HubOption {
	return func(h *Hub) {
		if d > 0 {
			h.syncTO = d
		}
	}
}

// NewHub builds a Hub over a dynamic client. It is the testable core: fakes
// supply a fake dynamic.Interface and need no discovery.
func NewHub(dyn dynamic.Interface, opts ...HubOption) *Hub {
	h := &Hub{
		dyn:     dyn,
		bufSize: DefaultSubscriberBuffer,
		syncTO:  DefaultSyncTimeout,
		entries: map[k8s.GVR]*entry{},
	}
	h.newInforms = func(g k8s.GVR) cache.SharedIndexInformer {
		gvr := schema.GroupVersionResource{Group: g.Group, Version: g.Version, Resource: g.Resource}
		// All namespaces: one watch serves every namespace; filtering is per subscriber.
		return dynamicinformer.NewFilteredDynamicInformer(dyn, gvr, metaNamespaceAll, 0,
			cache.Indexers{}, nil).Informer()
	}
	for _, o := range opts {
		o(h)
	}
	return h
}

const metaNamespaceAll = "" // metav1.NamespaceAll

// NewHubFromAccessor is the production constructor: the RESTMapper validates
// that the requested GVR exists.
//
// #46: the shared informer hub watches as the ServiceAccount, so SSE reads are
// NOT yet filtered per user — every subscriber sees the SA's view regardless of
// their own RBAC. B7 forwards tokens only on the request/CRUD path; the
// per-user cache + SSE read filter is issue #46 (next sprint).
func NewHubFromAccessor(acc k8s.ClusterAccessor, opts ...HubOption) *Hub {
	mapper := acc.Mapper()
	resolve := func(g k8s.GVR) error {
		gvr := schema.GroupVersionResource{Group: g.Group, Version: g.Version, Resource: g.Resource}
		if _, err := mapper.KindFor(gvr); err != nil {
			if meta.IsNoMatchError(err) {
				return k8s.NotFound("the server doesn't have a resource type %q", g.Resource)
			}
			return err
		}
		return nil
	}
	return NewHub(acc.Dynamic(), append([]HubOption{WithResolver(resolve)}, opts...)...)
}

// entry is the shared state for one GVR.
type entry struct {
	informer cache.SharedIndexInformer
	cancel   context.CancelFunc
	refs     int // guarded by Hub.mu

	mu   sync.Mutex // guards subs
	subs map[*sub]struct{}
}

// sub is one subscriber's queue.
type sub struct {
	ref  k8s.Ref
	in   chan Envelope // live deltas, filled non-blockingly by the dispatcher
	kick chan struct{} // closed (once) when the subscriber overflowed
}

func (s *sub) match(o *unstructured.Unstructured) bool {
	if s.ref.Namespace != "" && o.GetNamespace() != s.ref.Namespace {
		return false
	}
	if s.ref.Name != "" && o.GetName() != s.ref.Name {
		return false
	}
	return true
}

// acquire gets-or-creates the entry for g and takes a reference.
func (h *Hub) acquire(g k8s.GVR) (*entry, error) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.closed {
		return nil, fmt.Errorf("stream hub closed")
	}
	if e, ok := h.entries[g]; ok {
		e.refs++
		return e, nil
	}
	e := &entry{informer: h.newInforms(g), subs: map[*sub]struct{}{}}
	_, err := e.informer.AddEventHandler(cache.ResourceEventHandlerFuncs{
		AddFunc:    func(o any) { e.dispatch(Added, o) },
		UpdateFunc: func(_, o any) { e.dispatch(Modified, o) },
		DeleteFunc: func(o any) {
			if t, ok := o.(cache.DeletedFinalStateUnknown); ok {
				o = t.Obj
			}
			e.dispatch(Deleted, o)
		},
	})
	if err != nil {
		return nil, err
	}
	_ = e.informer.SetWatchErrorHandler(func(_ *cache.Reflector, err error) {
		log.Printf("stream: watch %s/%s/%s: %v (reflector will retry/relist)", g.Group, g.Version, g.Resource, err)
	})
	ctx, cancel := context.WithCancel(context.Background())
	e.cancel = cancel
	e.refs = 1
	h.entries[g] = e
	h.wg.Add(1)
	go func() {
		defer h.wg.Done()
		e.informer.Run(ctx.Done())
	}()
	return e, nil
}

// release drops a reference and stops the informer when it was the last one.
func (h *Hub) release(g k8s.GVR, e *entry) {
	h.mu.Lock()
	defer h.mu.Unlock()
	e.refs--
	if e.refs == 0 && h.entries[g] == e {
		delete(h.entries, g)
		e.cancel()
	}
}

// Close stops every informer and waits for them to exit. Further Watch calls fail.
func (h *Hub) Close() {
	h.mu.Lock()
	h.closed = true
	for g, e := range h.entries {
		delete(h.entries, g)
		e.cancel()
	}
	h.mu.Unlock()
	h.wg.Wait()
}

// dispatch fans one event out to all current subscribers without blocking.
func (e *entry) dispatch(typ string, o any) {
	u, ok := o.(*unstructured.Unstructured)
	if !ok {
		return
	}
	// One copy shared read-only by all subscribers; the cache's copy is never exposed to mutation.
	env := Envelope{Type: typ, Object: u.DeepCopy().Object}
	e.mu.Lock()
	defer e.mu.Unlock()
	for s := range e.subs {
		if !s.match(u) {
			continue
		}
		select {
		case s.in <- env:
		default: // full: disconnect this subscriber only
			delete(e.subs, s)
			close(s.kick)
		}
	}
}

// Watch implements Source.
func (h *Hub) Watch(ctx context.Context, ref k8s.Ref) (<-chan Envelope, error) {
	if h.resolve != nil {
		if err := h.resolve(ref.GVR); err != nil {
			return nil, err
		}
	}
	e, err := h.acquire(ref.GVR)
	if err != nil {
		return nil, err
	}
	syncCtx, cancel := context.WithTimeout(ctx, h.syncTO)
	ok := cache.WaitForCacheSync(syncCtx.Done(), e.informer.HasSynced)
	cancel()
	if !ok {
		h.release(ref.GVR, e)
		if ctx.Err() != nil {
			return nil, ctx.Err()
		}
		return nil, fmt.Errorf("informer for %s did not sync within %s", ref.Resource, h.syncTO)
	}

	s := &sub{ref: ref, in: make(chan Envelope, h.bufSize), kick: make(chan struct{})}
	// Register and snapshot under the entry lock: any event after this point is
	// queued in s.in. An object may appear both in the snapshot and as a queued
	// event (store updates precede handler delivery); consumers upsert by
	// identity so the duplicate is harmless, and nothing is ever missed.
	e.mu.Lock()
	e.subs[s] = struct{}{}
	snapshot := e.informer.GetStore().List()
	// Read the bookmark rv in the same critical section as the snapshot so the
	// bookmark is exactly consistent with the objects in the burst.
	rv := e.informer.LastSyncResourceVersion()
	e.mu.Unlock()

	out := make(chan Envelope)
	go func() {
		defer close(out)
		defer h.release(ref.GVR, e)
		defer func() {
			e.mu.Lock()
			delete(e.subs, s)
			e.mu.Unlock()
		}()
		send := func(env Envelope) bool {
			select {
			case out <- env:
				return true
			case <-ctx.Done():
				return false
			}
		}
		var maxRV uint64
		for _, o := range snapshot {
			u, ok := o.(*unstructured.Unstructured)
			if !ok || !s.match(u) {
				continue
			}
			if n, err := strconv.ParseUint(u.GetResourceVersion(), 10, 64); err == nil && n > maxRV {
				maxRV = n
			}
			// Deep-copy: the informer cache's object is shared across subscribers
			// and must never be exposed to mutation (mirrors the dispatch path).
			if !send(Envelope{Type: Added, Object: u.DeepCopy().Object}) {
				return
			}
		}
		if rv == "" {
			rv = strconv.FormatUint(maxRV, 10)
		}
		if !send(Envelope{Type: Bookmark, ResourceVersion: rv}) {
			return
		}
		for {
			select {
			case <-ctx.Done():
				return
			case env := <-s.in:
				if !send(env) {
					return
				}
			case <-s.kick:
				// Drain what was already queued, then tell the client to resync.
				for {
					select {
					case env := <-s.in:
						if !send(env) {
							return
						}
					default:
						send(Envelope{Type: Error, Message: "subscriber too slow; reconnect to resync"})
						return
					}
				}
			}
		}
	}()
	return out, nil
}
