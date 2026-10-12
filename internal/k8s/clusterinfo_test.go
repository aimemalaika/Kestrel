package k8s

import (
	"testing"

	"k8s.io/apimachinery/pkg/version"
	fakediscovery "k8s.io/client-go/discovery/fake"
	kubefake "k8s.io/client-go/kubernetes/fake"
)

func TestServerVersion(t *testing.T) {
	cs := kubefake.NewSimpleClientset()
	fd := cs.Discovery().(*fakediscovery.FakeDiscovery)
	fd.FakedServerVersion = &version.Info{GitVersion: "v1.33.4"}
	acc := NewAccessorFromAll(nil, fd, cs)

	got, err := ServerVersion(acc)
	if err != nil {
		t.Fatalf("unexpected err: %v", err)
	}
	if got != "v1.33.4" {
		t.Fatalf("got %q want v1.33.4", got)
	}
}

func TestServerVersionNilDiscovery(t *testing.T) {
	acc := NewAccessorFromAll(nil, nil, nil)
	got, err := ServerVersion(acc)
	if err != nil {
		t.Fatalf("unexpected err: %v", err)
	}
	if got != "" {
		t.Fatalf("got %q want empty", got)
	}
}
