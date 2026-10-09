package k8s

import (
	"context"
	"sync"
	"time"

	authzv1 "k8s.io/api/authorization/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"

	"github.com/aimemalaika/Kestrel/internal/auth"
)

// defaultSARTTL is how long a namespace-level list decision is cached. Short
// enough that an RBAC change takes effect within seconds, long enough that the
// initial-sync burst and the steady stream of live deltas are nearly all cache
// hits (one SSAR per user/namespace per window, not per object).
const defaultSARTTL = 15 * time.Second

// maxSARCache bounds the decision cache. The key includes the user, so a busy
// multi-tenant cluster can accumulate (users × namespaces) entries; the cap
// keeps that from growing without bound. Opportunistic eviction prefers expired
// entries; only if none are expired is the cache cleared wholesale.
const maxSARCache = 4096

// SSARAuthorizer answers "may THIS user list <gvr> in <namespace>" via a
// SelfSubjectAccessReview created with the user's own forwarded token, caching
// each decision for a short TTL. It structurally satisfies stream.Authorizer
// (CanList), so the stream package depends only on its own interface and k8s
// never imports stream (no cycle).
//
// Security posture:
//   - FAIL CLOSED: on any error building the per-user client or running the
//     SSAR, CanList returns (false, err) — the caller (the hub) skips the
//     object. Errors are NOT cached, so a transient failure is retried.
//   - HEDGE: with no user token on ctx (OIDC off / single-operator) CanList
//     returns (true, nil) — no filtering, today's behavior.
//
// It reuses userConfig (the anti-credential-leak boundary in real.go) to build
// the per-user client, so the SSE filter authenticates with exactly the same
// stripped, user-token-only identity as the CRUD / can-i path.
type SSARAuthorizer struct {
	acc ClusterAccessor
	ttl time.Duration

	mu    sync.Mutex
	cache map[string]sarDecision

	// clientFor builds a per-user typed client from a token. Overridable in tests
	// (so a fake clientset's SSAR reactor can be driven); the default builds a real
	// client via userConfig and fails closed when there is no rest.Config.
	clientFor func(token string) (kubernetes.Interface, error)
}

type sarDecision struct {
	allowed bool
	expires time.Time
}

// NewSSARAuthorizer builds an authorizer over the cluster accessor.
func NewSSARAuthorizer(acc ClusterAccessor) *SSARAuthorizer {
	a := &SSARAuthorizer{acc: acc, ttl: defaultSARTTL, cache: map[string]sarDecision{}}
	a.clientFor = a.buildClient
	return a
}

// buildClient builds a per-user typed client authenticating ONLY with the
// user's token (via userConfig). It fails closed when the accessor has no
// rest.Config (test fakes) rather than falling back to the SA — a stream filter
// must never run with SA privileges.
func (a *SSARAuthorizer) buildClient(token string) (kubernetes.Interface, error) {
	base := a.acc.RESTConfig()
	if base == nil {
		return nil, errNoClient()
	}
	kube, err := kubernetes.NewForConfig(userConfig(base, token))
	if err != nil {
		return nil, mapErr(err)
	}
	return kube, nil
}

// CanList reports whether the user on ctx may `list` gvr in namespace.
func (a *SSARAuthorizer) CanList(ctx context.Context, gvr GVR, namespace string) (bool, error) {
	id := auth.From(ctx)
	if id.Token == "" {
		// Hedge: no forwarded token ⇒ single-operator / OIDC off ⇒ do not filter.
		return true, nil
	}
	if id.User == "" {
		// A token with no resolved user must never happen (OIDC resolves a non-empty
		// subject), but if it did, distinct users would collide on a ("" ,gvr,ns)
		// cache key. Fail closed rather than risk a cross-user allow.
		return false, errNoClient()
	}

	// Cache key is (user, gvr, namespace) — keyed by USER, not token, so a
	// refreshed token (which rotates) reuses the stable user's decisions.
	key := id.User + "\x00" + gvr.Group + "\x00" + gvr.Version + "\x00" + gvr.Resource + "\x00" + namespace
	now := time.Now()

	a.mu.Lock()
	if d, ok := a.cache[key]; ok && now.Before(d.expires) {
		a.mu.Unlock()
		return d.allowed, nil
	}
	a.mu.Unlock()

	kube, err := a.clientFor(id.Token)
	if err != nil {
		return false, err // fail closed
	}
	if kube == nil {
		return false, errNoClient() // fail closed
	}

	ssar := &authzv1.SelfSubjectAccessReview{
		Spec: authzv1.SelfSubjectAccessReviewSpec{
			ResourceAttributes: &authzv1.ResourceAttributes{
				Verb:      "list",
				Group:     gvr.Group,
				Version:   gvr.Version,
				Resource:  gvr.Resource,
				Namespace: namespace,
			},
		},
	}
	res, err := kube.AuthorizationV1().SelfSubjectAccessReviews().Create(ctx, ssar, metav1.CreateOptions{})
	if err != nil {
		return false, mapErr(err) // fail closed; do NOT cache errors
	}

	a.store(key, res.Status.Allowed, now)
	return res.Status.Allowed, nil
}

// store caches a decision (allow AND deny are both cached), evicting first to
// stay under the cap.
func (a *SSARAuthorizer) store(key string, allowed bool, now time.Time) {
	a.mu.Lock()
	defer a.mu.Unlock()
	if len(a.cache) >= maxSARCache {
		a.evictLocked(now)
	}
	a.cache[key] = sarDecision{allowed: allowed, expires: now.Add(a.ttl)}
}

// evictLocked drops expired entries; if that frees nothing (all still live), it
// clears the cache so it can refill rather than growing unbounded.
func (a *SSARAuthorizer) evictLocked(now time.Time) {
	before := len(a.cache)
	for k, d := range a.cache {
		if !now.Before(d.expires) {
			delete(a.cache, k)
		}
	}
	if len(a.cache) == before {
		a.cache = map[string]sarDecision{}
	}
}
