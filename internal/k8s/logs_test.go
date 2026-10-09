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

func TestNewAccessorFromHasNilKube(t *testing.T) {
	acc := NewAccessorFrom(dynfake.NewSimpleDynamicClient(runtime.NewScheme()), &discfake.FakeDiscovery{})
	if acc.Kubernetes() != nil {
		t.Fatal("expected nil")
	}
	if _, err := NewRealLogs(acc).Stream(context.Background(), "d", "p", LogOptions{}); err == nil {
		t.Fatal("expected error")
	}
}
