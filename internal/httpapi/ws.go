package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"k8s.io/client-go/tools/remotecommand"

	"github.com/aimemalaika/Kestrel/internal/k8s"
)

// WebSocket timing. Pings keep the connection alive and let the server notice a
// dead peer; a pong (or any read) refreshes the read deadline.
const (
	writeWait  = 10 * time.Second
	pongWait   = 60 * time.Second
	pingPeriod = (pongWait * 9) / 10
)

// wsUpgrader upgrades exec/port-forward GETs. CheckOrigin enforces a same-origin
// policy: a request with no Origin header (a non-browser client) is allowed; a
// request carrying an Origin must match the request's scheme+host, so a browser
// on another site cannot open a cross-origin WebSocket to these endpoints.
var wsUpgrader = websocket.Upgrader{
	CheckOrigin: checkSameOrigin,
}

// checkSameOrigin is the wsUpgrader origin policy; the authn middleware mirrors
// it for the WS/SSE upgrade paths so the two agree.
func checkSameOrigin(r *http.Request) bool {
	origin := r.Header.Get("Origin")
	if origin == "" {
		return true // non-browser client; no browser same-origin guarantee to enforce
	}
	u, err := url.Parse(origin)
	if err != nil || u.Host == "" {
		return false
	}
	if !strings.EqualFold(u.Host, r.Host) {
		return false
	}
	scheme := "http"
	if r.TLS != nil || strings.EqualFold(r.Header.Get("X-Forwarded-Proto"), "https") {
		scheme = "https"
	}
	return u.Scheme == "" || strings.EqualFold(u.Scheme, scheme)
}

// podRef parses a logs-style pod path under the given /api prefix and requires a
// fully-qualified pod (resource "pods", name and namespace set).
func podRef(r *http.Request, prefix string) (k8s.Ref, bool) {
	segs := strings.Split(strings.Trim(strings.TrimPrefix(r.URL.Path, prefix), "/"), "/")
	ref, ok := parseRef(segs)
	if !ok || ref.Resource != "pods" || ref.Name == "" || ref.Namespace == "" {
		return k8s.Ref{}, false
	}
	return ref, true
}

// --- exec ---------------------------------------------------------------

func (a *api) exec(w http.ResponseWriter, r *http.Request) {
	ref, ok := podRef(r, "/api/exec")
	if !ok {
		writeStatus(w, http.StatusNotFound, "NotFound", "unknown exec path "+r.URL.Path)
		return
	}
	q := r.URL.Query()
	opts := k8s.ExecOptions{Container: q.Get("container"), Tty: true}
	if c := q.Get("command"); c != "" {
		opts.Command = []string{c}
	}
	conn, err := wsUpgrader.Upgrade(w, r, nil)
	if err != nil {
		return // Upgrade wrote the handshake error response.
	}
	defer conn.Close()
	runExec(r.Context(), conn, a.d.Exec, ref, opts)
}

// runExec bridges a WebSocket to an ExecStreamer. A text/binary WS frame that
// parses as {"type":"resize",...} becomes a terminal resize; any other frame is
// raw stdin, piped in via an io.Pipe. Exec stdout is written back as WS text
// frames. When either side ends, ctx is cancelled, the stdin pipe is closed, and
// the socket is closed with a close frame, so no goroutine leaks.
func runExec(parent context.Context, conn *websocket.Conn, execer k8s.ExecStreamer, ref k8s.Ref, opts k8s.ExecOptions) {
	ctx, cancel := context.WithCancel(parent)
	defer cancel()

	pr, pw := io.Pipe()
	resize := make(chan remotecommand.TerminalSize, 1)
	out := &wsWriter{conn: conn}

	_ = conn.SetReadDeadline(time.Now().Add(pongWait))
	conn.SetPongHandler(func(string) error {
		return conn.SetReadDeadline(time.Now().Add(pongWait))
	})
	go pingLoop(ctx, cancel, conn)

	// WS read pump → stdin pipe + resize channel. It is the sole writer/closer of
	// both, so closing them here is race-free.
	go func() {
		defer pw.Close()
		defer close(resize)
		for {
			mt, data, err := conn.ReadMessage()
			if err != nil {
				cancel()
				return
			}
			if mt != websocket.TextMessage && mt != websocket.BinaryMessage {
				continue
			}
			if sz, ok := parseResize(data); ok {
				select {
				case resize <- sz:
				case <-ctx.Done():
					return
				}
				continue
			}
			if _, err := pw.Write(data); err != nil {
				cancel()
				return
			}
		}
	}()

	err := execer.Stream(ctx, ref.Namespace, ref.Name, opts, pr, out, resize)
	cancel()
	_ = pr.CloseWithError(io.EOF) // unblock a blocked stdin reader
	closeWS(conn, err)            // unblocks the read pump (ReadMessage errors)
}

type resizeMsg struct {
	Type string `json:"type"`
	Cols uint16 `json:"cols"`
	Rows uint16 `json:"rows"`
}

// parseResize reports whether data is a terminal-resize control frame.
func parseResize(data []byte) (remotecommand.TerminalSize, bool) {
	var m resizeMsg
	if err := json.Unmarshal(data, &m); err != nil || m.Type != "resize" {
		return remotecommand.TerminalSize{}, false
	}
	return remotecommand.TerminalSize{Width: m.Cols, Height: m.Rows}, true
}

// wsWriter serializes WriteMessage calls; exec stdout flows through it.
type wsWriter struct {
	mu   sync.Mutex
	conn *websocket.Conn
}

func (w *wsWriter) Write(p []byte) (int, error) {
	w.mu.Lock()
	defer w.mu.Unlock()
	if err := w.conn.SetWriteDeadline(time.Now().Add(writeWait)); err != nil {
		return 0, err
	}
	if err := w.conn.WriteMessage(websocket.TextMessage, p); err != nil {
		return 0, err
	}
	return len(p), nil
}

// --- port-forward -------------------------------------------------------

// pfRegistry tracks active port-forward sessions so each can be cancelled and
// cleaned up. It is safe for concurrent use.
type pfRegistry struct {
	mu   sync.Mutex
	seq  int
	sess map[string]context.CancelFunc
}

func newPFRegistry() *pfRegistry { return &pfRegistry{sess: map[string]context.CancelFunc{}} }

func (r *pfRegistry) add(cancel context.CancelFunc) string {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.seq++
	id := fmt.Sprintf("pf-%d", r.seq)
	r.sess[id] = cancel
	return id
}

func (r *pfRegistry) remove(id string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	delete(r.sess, id)
}

func (r *pfRegistry) count() int {
	r.mu.Lock()
	defer r.mu.Unlock()
	return len(r.sess)
}

func parsePort(s string) (uint16, bool) {
	n, err := strconv.ParseUint(s, 10, 16)
	if err != nil || n == 0 {
		return 0, false
	}
	return uint16(n), true
}

func (a *api) portForward(w http.ResponseWriter, r *http.Request) {
	ref, ok := podRef(r, "/api/port-forward")
	if !ok {
		writeStatus(w, http.StatusNotFound, "NotFound", "unknown port-forward path "+r.URL.Path)
		return
	}
	q := r.URL.Query()
	local, lok := parsePort(q.Get("local"))
	remote, rok := parsePort(q.Get("remote"))
	if !lok || !rok {
		writeStatus(w, http.StatusBadRequest, "BadRequest", "invalid local/remote port")
		return
	}
	conn, err := wsUpgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	defer conn.Close()
	a.runForward(r.Context(), conn, ref, k8s.ForwardOptions{LocalPort: local, RemotePort: remote})
}

// runForward implements the locked design: the server binds the local port on
// this host and forwards to the pod; the WebSocket carries no data and acts
// purely as a lifecycle channel. The session is registered while active; when
// the browser disconnects (read loop errors) or ctx is cancelled, the forward
// is torn down and deregistered.
func (a *api) runForward(parent context.Context, conn *websocket.Conn, ref k8s.Ref, opts k8s.ForwardOptions) {
	ctx, cancel := context.WithCancel(parent)
	defer cancel()
	id := a.pf.add(cancel)
	defer a.pf.remove(id)

	ready := make(chan struct{})
	errCh := make(chan error, 1)
	go func() { errCh <- a.d.PortForward.Forward(ctx, ref.Namespace, ref.Name, opts, ready) }()

	_ = conn.SetReadDeadline(time.Now().Add(pongWait))
	conn.SetPongHandler(func(string) error {
		return conn.SetReadDeadline(time.Now().Add(pongWait))
	})
	go pingLoop(ctx, cancel, conn)

	// The WS carries no client data; any read result means the browser is gone.
	clientGone := make(chan struct{})
	go func() {
		defer close(clientGone)
		for {
			if _, _, err := conn.ReadMessage(); err != nil {
				return
			}
		}
	}()

	// Initial status once the forward is established (or bail on early failure).
	select {
	case <-ready:
		_ = conn.SetWriteDeadline(time.Now().Add(writeWait))
		_ = conn.WriteMessage(websocket.TextMessage, []byte(`{"status":"active"}`))
	case err := <-errCh:
		closeWS(conn, err)
		return
	case <-clientGone:
		closeWS(conn, nil)
		return
	}

	// Hold the forward open until the browser leaves, the forward ends, or ctx
	// is cancelled. cancel() (deferred) stops the forwarder in every path.
	select {
	case <-clientGone:
	case err := <-errCh:
		closeWS(conn, err)
		return
	case <-ctx.Done():
	}
	closeWS(conn, nil)
}

// --- shared WS helpers --------------------------------------------------

// pingLoop sends periodic pings until ctx is cancelled. WriteControl is safe to
// call concurrently with other writes. A failed ping means the peer is gone, so
// it cancels ctx to tear the session down promptly instead of waiting for the
// read deadline (~pongWait) to expire.
func pingLoop(ctx context.Context, cancel context.CancelFunc, conn *websocket.Conn) {
	t := time.NewTicker(pingPeriod)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			if conn.WriteControl(websocket.PingMessage, nil, time.Now().Add(writeWait)) != nil {
				cancel()
				return
			}
		}
	}
}

// closeWS sends a close frame (normal, or internal-error carrying err) and
// closes the connection.
func closeWS(conn *websocket.Conn, err error) {
	code := websocket.CloseNormalClosure
	msg := ""
	if err != nil && !errors.Is(err, context.Canceled) {
		code = websocket.CloseInternalServerErr
		msg = err.Error()
	}
	_ = conn.WriteControl(websocket.CloseMessage, websocket.FormatCloseMessage(code, msg), time.Now().Add(writeWait))
	_ = conn.Close()
}
