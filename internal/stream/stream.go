// Package stream holds the SSE watch envelope and its writer.
package stream

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/aimemalaika/Kestrel/internal/k8s"
)

// Envelope types per the contract.
const (
	Added    = "added"
	Modified = "modified"
	Deleted  = "deleted"
	Bookmark = "bookmark"
	Error    = "error"
)

// Envelope is one SSE data frame: {type, object|resourceVersion|message}.
type Envelope struct {
	Type            string     `json:"type"`
	Object          k8s.Object `json:"object,omitempty"`
	ResourceVersion string     `json:"resourceVersion,omitempty"`
	Message         string     `json:"message,omitempty"`
}

// Source produces envelopes for a watch.
//
// Contract for implementers (B1+): Watch MUST stop sending and close the returned
// channel when ctx is cancelled (the client disconnected). An implementation that
// spawns a sender goroutine must select on ctx.Done() to avoid leaking it on every
// client disconnect. The channel is also closed on normal completion.
type Source interface {
	Watch(ctx context.Context, ref k8s.Ref) (<-chan Envelope, error)
}

// StubSource emits an initial burst of added events then a bookmark.
type StubSource struct{}

func (StubSource) Watch(_ context.Context, ref k8s.Ref) (<-chan Envelope, error) {
	ch := make(chan Envelope, 3)
	for i := 1; i <= 2; i++ {
		r := ref
		r.Name = fmt.Sprintf("%s-%d", ref.Resource, i)
		ch <- Envelope{Type: Added, Object: k8s.StubObject(r)}
	}
	ch <- Envelope{Type: Bookmark, ResourceVersion: "1"}
	close(ch)
	return ch, nil
}

// Writer writes SSE frames.
type Writer struct {
	w http.ResponseWriter
	f http.Flusher
}

// Begin sets SSE headers and returns a Writer, or nil if streaming is unsupported.
func Begin(w http.ResponseWriter) *Writer {
	f, ok := w.(http.Flusher)
	if !ok {
		return nil
	}
	h := w.Header()
	h.Set("Content-Type", "text/event-stream")
	h.Set("Cache-Control", "no-cache")
	h.Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)
	f.Flush()
	return &Writer{w: w, f: f}
}

// Data writes `data: <json>\n\n`.
func (s *Writer) Data(v any) error {
	b, err := json.Marshal(v)
	if err != nil {
		return err
	}
	return s.Raw(string(b))
}

// Raw writes `data: <line>\n\n` with a pre-encoded payload.
func (s *Writer) Raw(payload string) error {
	if _, err := fmt.Fprintf(s.w, "data: %s\n\n", payload); err != nil {
		return err
	}
	s.f.Flush()
	return nil
}
