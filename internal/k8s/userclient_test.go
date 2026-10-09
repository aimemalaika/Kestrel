package k8s

import (
	"context"
	"testing"

	"k8s.io/apimachinery/pkg/runtime"
	discfake "k8s.io/client-go/discovery/fake"
	dynfake "k8s.io/client-go/dynamic/fake"
	kubefake "k8s.io/client-go/kubernetes/fake"

	"github.com/aimemalaika/Kestrel/internal/auth"
)

// TestUserClientsetEmptyTokenReturnsSA: with no forwarded token, the helper
// returns the accessor's SA clientset as-is (single-operator).
func TestUserClientsetEmptyTokenReturnsSA(t *testing.T) {
	kube := kubefake.NewSimpleClientset()
	acc := NewAccessorFromAll(dynfake.NewSimpleDynamicClient(runtime.NewScheme()), &discfake.FakeDiscovery{}, kube)

	got, err := UserClientset(context.Background(), acc)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got != kube {
		t.Fatalf("empty token should return the SA clientset, got %v", got)
	}
}

// TestUserClientsetTokenWithoutRESTConfigFailsClosed: a token is present but the
// accessor has no rest.Config to build a per-user client, so the helper must
// fail closed (error) rather than silently return the SA client.
func TestUserClientsetTokenWithoutRESTConfigFailsClosed(t *testing.T) {
	kube := kubefake.NewSimpleClientset()
	acc := NewAccessorFromAll(dynfake.NewSimpleDynamicClient(runtime.NewScheme()), &discfake.FakeDiscovery{}, kube)
	if acc.RESTConfig() != nil {
		t.Fatal("precondition: expected nil RESTConfig")
	}
	ctx := auth.WithIdentity(context.Background(), auth.Identity{User: "alice", Token: "user-token"})
	if _, err := UserClientset(ctx, acc); err == nil {
		t.Fatal("want error (fail closed) when token present but no rest.Config")
	}
}
