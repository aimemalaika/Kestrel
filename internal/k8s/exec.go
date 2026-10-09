package k8s

import (
	"context"
	"errors"
	"io"

	corev1 "k8s.io/api/core/v1"
	"k8s.io/client-go/kubernetes/scheme"
	"k8s.io/client-go/tools/remotecommand"
)

// ExecOptions are the exec query options.
type ExecOptions struct {
	Container string
	Command   []string
	Tty       bool
}

// ExecStreamer runs an exec against a pod, wiring the given stdio and resize
// queue. Stream blocks until the remote command exits, ctx is cancelled, or an
// error occurs. With Tty mode the stdout writer also carries stderr.
type ExecStreamer interface {
	Stream(ctx context.Context, namespace, pod string, opts ExecOptions, stdin io.Reader, stdout io.Writer, resize <-chan remotecommand.TerminalSize) error
}

// RealExec runs exec through the typed clientset's REST client over SPDY.
type RealExec struct{ acc ClusterAccessor }

// NewRealExec builds the real ExecStreamer from an accessor.
func NewRealExec(acc ClusterAccessor) *RealExec { return &RealExec{acc: acc} }

func (e *RealExec) Stream(ctx context.Context, ns, pod string, o ExecOptions, stdin io.Reader, stdout io.Writer, resize <-chan remotecommand.TerminalSize) error {
	kube := e.acc.Kubernetes()
	if kube == nil {
		return errors.New("typed kubernetes client not configured")
	}
	cfg := e.acc.RESTConfig()
	if cfg == nil {
		return errors.New("rest config not configured")
	}
	cmd := o.Command
	if len(cmd) == 0 {
		cmd = []string{"sh"}
	}
	req := kube.CoreV1().RESTClient().Post().
		Resource("pods").
		Name(pod).
		Namespace(ns).
		SubResource("exec").
		VersionedParams(&corev1.PodExecOptions{
			Container: o.Container,
			Command:   cmd,
			Stdin:     true,
			Stdout:    true,
			Stderr:    !o.Tty,
			TTY:       o.Tty,
		}, scheme.ParameterCodec)

	exec, err := remotecommand.NewSPDYExecutor(cfg, "POST", req.URL())
	if err != nil {
		return mapErr(err)
	}
	opts := remotecommand.StreamOptions{
		Stdin:             stdin,
		Stdout:            stdout,
		Tty:               o.Tty,
		TerminalSizeQueue: &sizeQueue{ch: resize},
	}
	// With Tty, kubernetes rejects a separate stderr stream; stdout carries both.
	if !o.Tty {
		opts.Stderr = stdout
	}
	if err := exec.StreamWithContext(ctx, opts); err != nil {
		return mapErr(err)
	}
	return nil
}

// sizeQueue adapts a resize channel to remotecommand.TerminalSizeQueue. Next
// returns nil (ending the queue) when the channel is closed.
type sizeQueue struct {
	ch <-chan remotecommand.TerminalSize
}

func (q *sizeQueue) Next() *remotecommand.TerminalSize {
	size, ok := <-q.ch
	if !ok {
		return nil
	}
	return &size
}

// StubExec echoes stdin back to stdout and observes resize events. It is the
// --mock executor: deterministic, cluster-free, and good enough to drive the
// terminal UI end to end.
type StubExec struct{}

func (StubExec) Stream(ctx context.Context, _ string, _ string, _ ExecOptions, stdin io.Reader, stdout io.Writer, resize <-chan remotecommand.TerminalSize) error {
	if _, err := io.WriteString(stdout, "kestrel mock shell\r\n"); err != nil {
		return err
	}
	// Drain resize events so a producer is never blocked.
	go func() {
		for range resize {
		}
	}()
	buf := make([]byte, 4096)
	readDone := make(chan struct{})
	var readErr error
	go func() {
		defer close(readDone)
		for {
			n, err := stdin.Read(buf)
			if n > 0 {
				if _, werr := stdout.Write(buf[:n]); werr != nil {
					readErr = werr
					return
				}
			}
			if err != nil {
				if err != io.EOF {
					readErr = err
				}
				return
			}
		}
	}()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-readDone:
		return readErr
	}
}
