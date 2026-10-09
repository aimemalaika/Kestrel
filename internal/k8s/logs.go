package k8s

import (
	"context"
	"errors"
	"io"
	"strings"

	corev1 "k8s.io/api/core/v1"
)

// LogOptions are the pod-log query options.
type LogOptions struct {
	Container    string
	Follow       bool
	TailLines    *int64
	SinceSeconds *int64
}

// LogStreamer opens a pod log stream. The caller must Close the result; the
// stream must also end when ctx is cancelled.
type LogStreamer interface {
	Stream(ctx context.Context, ns, pod string, opts LogOptions) (io.ReadCloser, error)
}

// RealLogs streams logs through the typed clientset.
type RealLogs struct{ acc ClusterAccessor }

// NewRealLogs builds the real LogStreamer from an accessor.
func NewRealLogs(acc ClusterAccessor) *RealLogs { return &RealLogs{acc: acc} }

func (l *RealLogs) Stream(ctx context.Context, ns, pod string, o LogOptions) (io.ReadCloser, error) {
	kube := l.acc.Kubernetes()
	if kube == nil {
		return nil, errors.New("typed kubernetes client not configured")
	}
	rc, err := kube.CoreV1().Pods(ns).GetLogs(pod, &corev1.PodLogOptions{
		Container:    o.Container,
		Follow:       o.Follow,
		TailLines:    o.TailLines,
		SinceSeconds: o.SinceSeconds,
	}).Stream(ctx)
	if err != nil {
		return nil, mapErr(err)
	}
	return rc, nil
}

// StubLogs serves canned lines (B0 / --mock).
type StubLogs struct{}

func (StubLogs) Stream(context.Context, string, string, LogOptions) (io.ReadCloser, error) {
	return io.NopCloser(strings.NewReader("stub log line 1\nstub log line 2\nstub log line 3\n")), nil
}
