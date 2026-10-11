package httpapi

import (
	"context"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/aimemalaika/Kestrel/internal/auth"
	"github.com/aimemalaika/Kestrel/internal/k8s"
	"github.com/aimemalaika/Kestrel/internal/stream"
)

// ctxBlockSource keeps a watch open until the context is cancelled, so a test
// can observe the stream ending on the token-expiry deadline rather than on an
// upstream close.
type ctxBlockSource struct{}

func (ctxBlockSource) Watch(ctx context.Context, _ k8s.Ref) (<-chan stream.Envelope, error) {
	ch := make(chan stream.Envelope)
	go func() {
		<-ctx.Done()
		close(ch)
	}()
	return ch, nil
}

// TestStreamBoundedByTokenExpiry: a watch stream for a user whose id_token
// expires soon ends at Expiry-streamTokenSkew (so the client reconnects with a
// refreshed token), even though the upstream never closes and the client never
// disconnects. #106.
func TestStreamBoundedByTokenExpiry(t *testing.T) {
	d := DefaultDeps()
	d.Stream = ctxBlockSource{}
	h := New(d)

	// Deadline = Expiry - streamTokenSkew ≈ now + 300ms.
	id := auth.Identity{User: "u", Token: "tok", Expiry: time.Now().Add(streamTokenSkew + 300*time.Millisecond)}
	req := httptest.NewRequest("GET", "/api/stream/core/v1/namespaces/default/pods", nil).
		WithContext(auth.WithIdentity(context.Background(), id))
	rec := httptest.NewRecorder()

	done := make(chan struct{})
	go func() { h.ServeHTTP(rec, req); close(done) }()

	select {
	case <-done:
		// Returned on the expiry deadline — good.
	case <-time.After(3 * time.Second):
		t.Fatal("stream was not bounded by token expiry")
	}
}

// TestStreamUnboundedWithoutToken: single-operator (no token) streams are not
// bounded by an expiry deadline — they run until the client disconnects.
func TestStreamUnboundedWithoutToken(t *testing.T) {
	d := DefaultDeps()
	d.Stream = ctxBlockSource{}
	h := New(d)

	ctx, cancel := context.WithCancel(context.Background())
	// No identity/token on ctx (operator mode); auth.Middleware injects an
	// empty-token Operator identity, so no expiry deadline applies.
	req := httptest.NewRequest("GET", "/api/stream/core/v1/namespaces/default/pods", nil).WithContext(ctx)
	rec := httptest.NewRecorder()

	done := make(chan struct{})
	go func() { h.ServeHTTP(rec, req); close(done) }()

	select {
	case <-done:
		t.Fatal("stream ended on its own without a token (should run until client disconnect)")
	case <-time.After(400 * time.Millisecond):
		// Still open — correct. Now disconnect and expect it to end.
	}
	cancel()
	select {
	case <-done:
	case <-time.After(3 * time.Second):
		t.Fatal("stream did not end after client disconnect")
	}
}
