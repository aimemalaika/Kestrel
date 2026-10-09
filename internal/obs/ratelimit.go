package obs

import (
	"encoding/json"
	"net/http"
	"strconv"
	"sync"
	"time"

	"golang.org/x/time/rate"

	"github.com/aimemalaika/Kestrel/internal/auth"
)

// RateLimiter is a token-bucket limiter keyed per caller: per authenticated
// user when an identity is on the context (set by the authn middleware), else
// per client IP. One token is spent per REQUEST — a new SSE/WS connection costs
// one token on arrival and is never throttled mid-stream (the bucket is only
// consulted when the connection is established).
//
// Per-key *rate.Limiter values live in a mutex-guarded map with periodic
// eviction of idle entries, so the map stays bounded under churning keys
// (rotating users/IPs).
type RateLimiter struct {
	rps   rate.Limit
	burst int

	// trustProxy controls per-IP keying: when false (default) the client IP is
	// taken from RemoteAddr only, so a client cannot rotate X-Forwarded-For to
	// mint a fresh full-burst bucket per request (rate-limit bypass) or flood
	// the bucket map with forged keys. See ClientIP.
	trustProxy bool

	mu      sync.Mutex
	buckets map[string]*bucket

	// maxKeys hard-caps the bucket map so memory stays bounded even behind a
	// misbehaving/absent proxy that lets keys churn (with trustProxy=true) or
	// under a flood of distinct authenticated users. On overflow the whole map
	// is cleared and reseeded — the cheapest race-safe bound; worst case a few
	// callers get a fresh bucket slightly early, which is harmless.
	maxKeys int

	now      func() time.Time // injectable clock for tests
	idleTTL  time.Duration
	stopOnce sync.Once
	stop     chan struct{}
}

// defaultMaxKeys bounds the per-key bucket map.
const defaultMaxKeys = 50_000

type bucket struct {
	lim  *rate.Limiter
	seen time.Time
}

// NewRateLimiter builds a limiter allowing rps requests/sec with the given
// burst. rps <= 0 disables limiting (NewRateLimiter returns nil, and the nil
// receiver's Middleware is a pass-through). A background janitor evicts keys
// idle longer than idleTTL; call Close to stop it.
func NewRateLimiter(rps float64, burst int, trustProxy bool) *RateLimiter {
	if rps <= 0 {
		return nil // disabled
	}
	if burst < 1 {
		burst = 1
	}
	rl := &RateLimiter{
		rps:        rate.Limit(rps),
		burst:      burst,
		trustProxy: trustProxy,
		buckets:    make(map[string]*bucket),
		maxKeys:    defaultMaxKeys,
		now:        time.Now,
		idleTTL:    10 * time.Minute,
		stop:       make(chan struct{}),
	}
	go rl.janitor(time.Minute)
	return rl
}

// Close stops the eviction janitor. Safe to call on a nil receiver and to call
// more than once.
func (rl *RateLimiter) Close() {
	if rl == nil {
		return
	}
	rl.stopOnce.Do(func() { close(rl.stop) })
}

func (rl *RateLimiter) janitor(every time.Duration) {
	t := time.NewTicker(every)
	defer t.Stop()
	for {
		select {
		case <-rl.stop:
			return
		case <-t.C:
			rl.evictIdle()
		}
	}
}

func (rl *RateLimiter) evictIdle() {
	cutoff := rl.now().Add(-rl.idleTTL)
	rl.mu.Lock()
	for k, b := range rl.buckets {
		if b.seen.Before(cutoff) {
			delete(rl.buckets, k)
		}
	}
	rl.mu.Unlock()
}

// limiterFor returns the bucket for key, creating it on first use and refreshing
// its last-seen time.
func (rl *RateLimiter) limiterFor(key string) *rate.Limiter {
	rl.mu.Lock()
	defer rl.mu.Unlock()
	b, ok := rl.buckets[key]
	if !ok {
		// Enforce the cap before inserting a new key. Clearing and reseeding is
		// the simplest bound that stays correct under the mutex we already hold.
		if rl.maxKeys > 0 && len(rl.buckets) >= rl.maxKeys {
			rl.buckets = make(map[string]*bucket, rl.maxKeys)
		}
		b = &bucket{lim: rate.NewLimiter(rl.rps, rl.burst)}
		rl.buckets[key] = b
	}
	b.seen = rl.now()
	return b.lim
}

// key derives the limiter key: the authenticated user when present, else the
// client IP (resolved per rl.trustProxy — see ClientIP).
func (rl *RateLimiter) key(r *http.Request) string {
	if user := auth.From(r.Context()).User; user != "" {
		return "user:" + user
	}
	return "ip:" + ClientIP(r, rl.trustProxy)
}

// Middleware spends one token per request for the caller's key, responding 429
// with the contract error body and a Retry-After header when the bucket is
// empty. A nil receiver (limiting disabled) is a pass-through.
func (rl *RateLimiter) Middleware(next http.Handler) http.Handler {
	if rl == nil {
		return next
	}
	// Retry-After is advisory; one token refills every 1/rps seconds.
	retryAfter := strconv.Itoa(max(1, int(1.0/float64(rl.rps)+0.999)))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !rl.limiterFor(rl.key(r)).Allow() {
			w.Header().Set("Retry-After", retryAfter)
			writeRateLimited(w)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// writeRateLimited emits the contract error body {error,code,reason} with 429.
// Kept local to avoid importing internal/httpapi (and any import cycle).
func writeRateLimited(w http.ResponseWriter) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusTooManyRequests)
	_ = json.NewEncoder(w).Encode(map[string]any{
		"error":  "rate limit exceeded",
		"code":   http.StatusTooManyRequests,
		"reason": "TooManyRequests",
	})
}
