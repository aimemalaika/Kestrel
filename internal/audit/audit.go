// Package audit records cluster mutations as one JSON line per event. It is
// deliberately tiny and dependency-free: the write layer calls Record after
// every apply and delete (including dry-run and blocked writes); reads are not
// audited.
package audit

import (
	"encoding/json"
	"io"
	"os"
	"sync"
)

// Event is a single audited mutation. One JSON line is emitted per Event.
type Event struct {
	Time      string `json:"time"`  // RFC3339
	User      string `json:"user"`  // the authenticated session identity, from auth.From(ctx)
	Verb      string `json:"verb"`  // apply | delete
	Group     string `json:"group"` // internal group ("" for core)
	Version   string `json:"version"`
	Resource  string `json:"resource"`
	Namespace string `json:"namespace"`
	Name      string `json:"name"`
	DryRun    bool   `json:"dryRun"`
	Result    string `json:"result"`          // ok | error
	Code      int    `json:"code"`            // HTTP-ish status; 0 on plain success
	Error     string `json:"error,omitempty"` // message when Result == error
}

// Auditor records mutation events.
type Auditor interface {
	Record(Event)
}

// StdoutAuditor writes one JSON line per event to an io.Writer (os.Stdout by
// default) under a mutex, so concurrent writers never interleave a line.
type StdoutAuditor struct {
	mu sync.Mutex
	w  io.Writer
}

// NewStdoutAuditor writes events to w, or os.Stdout when w is nil.
func NewStdoutAuditor(w io.Writer) *StdoutAuditor {
	if w == nil {
		w = os.Stdout
	}
	return &StdoutAuditor{w: w}
}

// Record marshals ev and writes it as a single newline-terminated line.
func (a *StdoutAuditor) Record(ev Event) {
	line, err := json.Marshal(ev)
	if err != nil {
		return
	}
	line = append(line, '\n')
	a.mu.Lock()
	defer a.mu.Unlock()
	_, _ = a.w.Write(line)
}

// Nop discards every event. Useful for tests that don't assert on audit.
type Nop struct{}

func (Nop) Record(Event) {}
