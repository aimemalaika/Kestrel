package k8s

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"

	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/tools/portforward"
	"k8s.io/client-go/transport/spdy"

	"github.com/aimemalaika/Kestrel/internal/auth"
)

// ForwardOptions are the port-forward ports (host-side local, pod-side remote).
type ForwardOptions struct {
	LocalPort  uint16
	RemotePort uint16
}

// PortForwarder starts a server-side port-forward: it binds LocalPort on the
// Kestrel host and forwards to RemotePort on the pod. Forward blocks until ctx
// is cancelled or it errors; ready is closed once the forward is established.
type PortForwarder interface {
	Forward(ctx context.Context, namespace, pod string, opts ForwardOptions, ready chan<- struct{}) error
}

// RealPortForward runs a client-go port-forward over SPDY.
type RealPortForward struct{ acc ClusterAccessor }

// NewRealPortForward builds the real PortForwarder from an accessor.
func NewRealPortForward(acc ClusterAccessor) *RealPortForward { return &RealPortForward{acc: acc} }

func (p *RealPortForward) Forward(ctx context.Context, ns, pod string, o ForwardOptions, ready chan<- struct{}) error {
	cfg := p.acc.RESTConfig()
	if cfg == nil {
		return errors.New("rest config not configured")
	}
	// B7: port-forward as the user on ctx. The SPDY round-tripper carries auth, so
	// it MUST be built from the per-user config when a token is present.
	kube := p.acc.Kubernetes()
	if token := auth.From(ctx).Token; token != "" {
		cfg = userConfig(cfg, token)
		k, err := kubernetes.NewForConfig(cfg)
		if err != nil {
			return mapErr(err)
		}
		kube = k
	}
	if kube == nil {
		k, err := kubernetes.NewForConfig(cfg)
		if err != nil {
			return mapErr(err)
		}
		kube = k
	}
	rt, upgrader, err := spdy.RoundTripperFor(cfg)
	if err != nil {
		return mapErr(err)
	}
	u := kube.CoreV1().RESTClient().Post().
		Resource("pods").
		Name(pod).
		Namespace(ns).
		SubResource("portforward").
		URL()
	dialer := spdy.NewDialer(upgrader, &http.Client{Transport: rt}, "POST", u)

	stopCh := make(chan struct{})
	readyCh := make(chan struct{})
	// ctx cancellation (browser disconnect) tears the forward down.
	go func() {
		<-ctx.Done()
		close(stopCh)
	}()
	// Relay the forwarder's own ready signal to the caller.
	go func() {
		select {
		case <-readyCh:
			if ready != nil {
				close(ready)
			}
		case <-stopCh:
		}
	}()

	ports := []string{fmt.Sprintf("%d:%d", o.LocalPort, o.RemotePort)}
	fw, err := portforward.New(dialer, ports, stopCh, readyCh, io.Discard, io.Discard)
	if err != nil {
		return mapErr(err)
	}
	if err := fw.ForwardPorts(); err != nil {
		return mapErr(err)
	}
	return nil
}

// StubPortForward signals ready immediately and blocks until ctx is cancelled,
// binding no real socket. It is the --mock forwarder: deterministic and
// cluster-free.
type StubPortForward struct{}

func (StubPortForward) Forward(ctx context.Context, _ string, _ string, _ ForwardOptions, ready chan<- struct{}) error {
	if ready != nil {
		close(ready)
	}
	<-ctx.Done()
	return nil
}
