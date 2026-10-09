package k8s

import (
	"context"
	"io"
	"testing"

	"k8s.io/apimachinery/pkg/runtime"
	discfake "k8s.io/client-go/discovery/fake"
	dynfake "k8s.io/client-go/dynamic/fake"
	kubefake "k8s.io/client-go/kubernetes/fake"
)

func TestRealLogsStreamsFromFakeClientset(t *testing.T) {
	kube := kubefake.NewSimpleClientset()
	acc := NewAccessorFromAll(dynfake.NewSimpleDynamicClient(runtime.NewScheme()), &discfake.FakeDiscovery{}, kube)
	if acc.Kubernetes() == nil {
		t.Fatal("Kubernetes() nil")
	}
	var n int64 = 5
	rc, err := NewRealLogs(acc).Stream(context.Background(), "default", "web-1", LogOptions{Container: "c", Follow: true, TailLines: &n})
	if err != nil {
		t.Fatal(err)
	}
	defer rc.Close()
	b, _ := io.ReadAll(rc)
	if string(b) != "fake logs" {
		t.Fatalf("got %q", b)
	}
}

// TestRealLogsTokenWithoutRESTConfigFailsClosed covers FIX 2: when a user token
// is present but the accessor has no rest.Config to build a per-user client, the
// stream must FAIL CLOSED (error) rather than silently serve logs with the SA
// clientset. (NewAccessorFromAll supplies a typed clientset but a nil cfg.)
func TestRealLogsTokenWithoutRESTConfigFailsClosed(t *testing.T) {
	kube := kubefake.NewSimpleClientset()
	acc := NewAccessorFromAll(dynfake.NewSimpleDynamicClient(runtime.NewScheme()), &discfake.FakeDiscovery{}, kube)
	if acc.RESTConfig() != nil {
		t.Fatal("precondition: expected nil RESTConfig")
	}
	ctx := ctxTok("user-id-token")
	if _, err := NewRealLogs(acc).Stream(ctx, "default", "web-1", LogOptions{Container: "c"}); err == nil {
		t.Fatal("expected an error (fail closed) when a token is present but RESTConfig is nil")
	}
}

func TestNewAccessorFromHasNilKube(t *testing.T) {
	acc := NewAccessorFrom(dynfake.NewSimpleDynamicClient(runtime.NewScheme()), &discfake.FakeDiscovery{})
	if acc.Kubernetes() != nil {
		t.Fatal("expected nil")
	}
	if _, err := NewRealLogs(acc).Stream(context.Background(), "d", "p", LogOptions{}); err == nil {
		t.Fatal("expected error")
	}
}
