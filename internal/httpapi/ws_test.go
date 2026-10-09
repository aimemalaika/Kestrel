package httpapi

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
	"k8s.io/client-go/tools/remotecommand"

	"github.com/aimemalaika/Kestrel/internal/auth"
	"github.com/aimemalaika/Kestrel/internal/k8s"
)

const (
	execPath    = "/api/exec/core/v1/namespaces/default/pods/web-1"
	forwardPath = "/api/port-forward/core/v1/namespaces/default/pods/web-1"
	wsTimeout   = 2 * time.Second
)

// newAPI builds an api with real registry wiring but injected fakes.
func newAPI(d Deps) *api { return &api{d: d, pf: newPFRegistry()} }

func wsServer(t *testing.T, a *api) (*httptest.Server, string) {
	t.Helper()
	srv := httptest.NewServer(auth.Middleware(http.HandlerFunc(a.route)))
	t.Cleanup(srv.Close)
	return srv, "ws" + strings.TrimPrefix(srv.URL, "http")
}

func dial(t *testing.T, wsURL string) *websocket.Conn {
	t.Helper()
	c, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("dial %s: %v", wsURL, err)
	}
	t.Cleanup(func() { c.Close() })
	return c
}

// --- exec ---------------------------------------------------------------

// fakeExec echoes stdin to stdout and records the first resize it observes.
type fakeExec struct {
	resized chan remotecommand.TerminalSize
	done    chan struct{}
}

func newFakeExec() *fakeExec {
	return &fakeExec{resized: make(chan remotecommand.TerminalSize, 1), done: make(chan struct{})}
}

func (f *fakeExec) Stream(ctx context.Context, _ string, _ string, _ k8s.ExecOptions, stdin io.Reader, stdout io.Writer, resize <-chan remotecommand.TerminalSize) error {
	defer close(f.done)
	go func() {
		for sz := range resize {
			select {
			case f.resized <- sz:
			default:
			}
		}
	}()
	buf := make([]byte, 1024)
	readDone := make(chan struct{})
	go func() {
		defer close(readDone)
		for {
			n, err := stdin.Read(buf)
			if n > 0 {
				if _, werr := stdout.Write(buf[:n]); werr != nil {
					return
				}
			}
			if err != nil {
				return
			}
		}
	}()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-readDone:
		return nil
	}
}

func TestExecEchoesStdin(t *testing.T) {
	fe := newFakeExec()
	_, wsURL := wsServer(t, newAPI(Deps{Exec: fe}))
	c := dial(t, wsURL+execPath)

	if err := c.WriteMessage(websocket.TextMessage, []byte("hello")); err != nil {
		t.Fatal(err)
	}
	c.SetReadDeadline(time.Now().Add(wsTimeout))
	mt, data, err := c.ReadMessage()
	if err != nil {
		t.Fatalf("read: %v", err)
	}
	if mt != websocket.TextMessage || string(data) != "hello" {
		t.Fatalf("got type=%d data=%q", mt, data)
	}
}

func TestExecResizeObserved(t *testing.T) {
	fe := newFakeExec()
	_, wsURL := wsServer(t, newAPI(Deps{Exec: fe}))
	c := dial(t, wsURL+execPath)

	if err := c.WriteMessage(websocket.TextMessage, []byte(`{"type":"resize","cols":120,"rows":40}`)); err != nil {
		t.Fatal(err)
	}
	select {
	case sz := <-fe.resized:
		if sz.Width != 120 || sz.Height != 40 {
			t.Fatalf("resize = %+v", sz)
		}
	case <-time.After(wsTimeout):
		t.Fatal("resize never observed")
	}
}

func TestExecTeardownOnClientClose(t *testing.T) {
	fe := newFakeExec()
	_, wsURL := wsServer(t, newAPI(Deps{Exec: fe}))
	c := dial(t, wsURL+execPath)

	c.Close() // client disconnects
	select {
	case <-fe.done:
	case <-time.After(wsTimeout):
		t.Fatal("exec stream not torn down after client close")
	}
}

// --- port-forward -------------------------------------------------------

// fakeForward signals ready, then blocks until ctx is cancelled.
type fakeForward struct {
	opts    chan k8s.ForwardOptions
	stopped chan struct{}
}

func newFakeForward() *fakeForward {
	return &fakeForward{opts: make(chan k8s.ForwardOptions, 1), stopped: make(chan struct{})}
}

func (f *fakeForward) Forward(ctx context.Context, _ string, _ string, o k8s.ForwardOptions, ready chan<- struct{}) error {
	f.opts <- o
	if ready != nil {
		close(ready)
	}
	<-ctx.Done()
	close(f.stopped)
	return nil
}

func TestPortForwardLifecycle(t *testing.T) {
	ff := newFakeForward()
	a := newAPI(Deps{PortForward: ff})
	_, wsURL := wsServer(t, a)
	c := dial(t, wsURL+forwardPath+"?local=8080&remote=80")

	// Forward started with the requested ports.
	select {
	case o := <-ff.opts:
		if o.LocalPort != 8080 || o.RemotePort != 80 {
			t.Fatalf("opts = %+v", o)
		}
	case <-time.After(wsTimeout):
		t.Fatal("forward never started")
	}

	// Initial status frame means the session is active and registered.
	c.SetReadDeadline(time.Now().Add(wsTimeout))
	if _, data, err := c.ReadMessage(); err != nil || !strings.Contains(string(data), "active") {
		t.Fatalf("status frame: data=%q err=%v", data, err)
	}
	if n := a.pf.count(); n != 1 {
		t.Fatalf("registry count = %d, want 1", n)
	}

	// Client disconnects → forwarder ctx cancelled and session deregistered.
	c.Close()
	select {
	case <-ff.stopped:
	case <-time.After(wsTimeout):
		t.Fatal("forwarder not stopped after client close")
	}
	deadline := time.Now().Add(wsTimeout)
	for a.pf.count() != 0 {
		if time.Now().After(deadline) {
			t.Fatalf("session not deregistered, count = %d", a.pf.count())
		}
		time.Sleep(5 * time.Millisecond)
	}
}

func TestPortForwardBadPortRejectedBeforeUpgrade(t *testing.T) {
	ff := newFakeForward()
	_, wsURL := wsServer(t, newAPI(Deps{PortForward: ff}))

	_, resp, err := websocket.DefaultDialer.Dial(wsURL+forwardPath+"?local=abc&remote=80", nil)
	if err == nil {
		t.Fatal("expected handshake to fail on bad port")
	}
	if resp == nil || resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("want 400, got %v", resp)
	}
}
