package audit

import (
	"bytes"
	"encoding/json"
	"sync"
	"testing"
)

func TestRecordWritesOneJSONLine(t *testing.T) {
	var buf bytes.Buffer
	a := NewStdoutAuditor(&buf)
	a.Record(Event{Time: "t", User: "u", Verb: "apply", Resource: "pods", Result: "ok"})

	b := buf.Bytes()
	if n := bytes.Count(b, []byte("\n")); n != 1 || b[len(b)-1] != '\n' {
		t.Fatalf("want exactly one trailing newline, got %d: %q", n, b)
	}
	var ev Event
	if err := json.Unmarshal(bytes.TrimSpace(b), &ev); err != nil {
		t.Fatalf("not valid JSON: %v", err)
	}
	if ev.Verb != "apply" || ev.Result != "ok" || ev.User != "u" {
		t.Errorf("round-trip mismatch: %+v", ev)
	}
}

// Error omitempty: an ok event must not carry an "error" field.
func TestRecordOmitsEmptyError(t *testing.T) {
	var buf bytes.Buffer
	NewStdoutAuditor(&buf).Record(Event{Verb: "delete", Result: "ok"})
	var m map[string]any
	if err := json.Unmarshal(bytes.TrimSpace(buf.Bytes()), &m); err != nil {
		t.Fatal(err)
	}
	if _, ok := m["error"]; ok {
		t.Errorf("empty error should be omitted: %v", m)
	}
}

// TestConcurrentRecord hammers Record from N goroutines and asserts exactly N
// well-formed lines come out, with no interleaving (run under -race).
func TestConcurrentRecord(t *testing.T) {
	const n = 200
	var buf bytes.Buffer
	a := NewStdoutAuditor(&buf)
	var wg sync.WaitGroup
	for i := 0; i < n; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			a.Record(Event{Verb: "apply", Result: "ok"})
		}()
	}
	wg.Wait()

	lines := bytes.Split(bytes.TrimRight(buf.Bytes(), "\n"), []byte("\n"))
	if len(lines) != n {
		t.Fatalf("want %d lines, got %d", n, len(lines))
	}
	for _, l := range lines {
		var ev Event
		if err := json.Unmarshal(l, &ev); err != nil {
			t.Fatalf("interleaved/invalid line %q: %v", l, err)
		}
	}
}

func TestNopDoesNotPanic(t *testing.T) {
	Nop{}.Record(Event{Verb: "apply"})
}
