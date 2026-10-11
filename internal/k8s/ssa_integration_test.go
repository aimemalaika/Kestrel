//go:build envtest

// Package k8s integration test for REAL Server-Side Apply against a live
// kube-apiserver booted by controller-runtime's envtest (kube-apiserver + etcd
// from downloaded binaries; no Docker).
//
// This file is gated behind the `envtest` build tag so the default `go test`
// stays cluster-free. Run it with:
//
//	export KUBEBUILDER_ASSETS=$(setup-envtest use -p path 1.31.0)
//	go test -tags envtest ./internal/k8s/ -run Integration -count=1 -v
//
// If the envtest binaries are not installed (no KUBEBUILDER_ASSETS and
// env.Start() fails), TestMain prints guidance pointing at setup-envtest and
// exits 0 so a dev machine without assets is not hard-failed.
//
// Why envtest and not dynamic/fake: dynamic/fake cannot run
// structured-merge-diff, so the real merge / 409-on-conflict / dry-run
// semantics of internal/k8s/real.go Apply/Delete are only covered against a
// real apiserver.
package k8s_test

import (
	"context"
	"errors"
	"fmt"
	"os"
	"testing"
	"time"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	"sigs.k8s.io/controller-runtime/pkg/envtest"

	"github.com/aimemalaika/Kestrel/internal/k8s"
)

// testEnv holds the running environment shared by all subtests.
var (
	testCfg *rest.Config
	testNS  = "ssa-it"
)

// TestMain boots a real apiserver once for the whole package run and tears it
// down afterward. If the binaries aren't available it skips the whole run
// cleanly (exit 0) with a message pointing at setup-envtest.
func TestMain(m *testing.M) {
	env := &envtest.Environment{}
	cfg, err := env.Start()
	if err != nil {
		// Most commonly: KUBEBUILDER_ASSETS unset / binaries not downloaded.
		fmt.Println("skipping SSA envtest: could not start a kube-apiserver via envtest:", err)
		fmt.Println("install the control-plane binaries first, e.g.:")
		fmt.Println("  go install sigs.k8s.io/controller-runtime/tools/setup-envtest@latest")
		fmt.Println("  export KUBEBUILDER_ASSETS=$(setup-envtest use -p path 1.31.0)")
		fmt.Println("  (current KUBEBUILDER_ASSETS =", os.Getenv("KUBEBUILDER_ASSETS"), ")")
		os.Exit(0)
	}
	testCfg = cfg

	// Create the test namespace via the typed client before any subtest runs.
	if err := ensureNamespace(cfg, testNS); err != nil {
		fmt.Println("failed to create test namespace:", err)
		_ = env.Stop()
		os.Exit(1)
	}

	code := m.Run()
	if err := env.Stop(); err != nil {
		fmt.Println("warning: envtest stop failed:", err)
	}
	os.Exit(code)
}

func ensureNamespace(cfg *rest.Config, name string) error {
	kube, err := kubernetes.NewForConfig(cfg)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	_, err = kube.CoreV1().Namespaces().Create(ctx, &corev1.Namespace{
		ObjectMeta: metav1.ObjectMeta{Name: name},
	}, metav1.CreateOptions{})
	return err
}

// newReal builds the real client-go-backed stack over the envtest config.
func newReal(t *testing.T) *k8s.Real {
	t.Helper()
	acc, err := k8s.NewAccessor(testCfg)
	if err != nil {
		t.Fatalf("NewAccessor: %v", err)
	}
	return k8s.NewReal(acc)
}

// configMap builds a ConfigMap as a k8s.Object (unstructured map) with
// apiVersion/kind/metadata/data, matching how Apply resolves the GVR from the
// object itself.
func configMap(name string, data map[string]any) k8s.Object {
	return k8s.Object{
		"apiVersion": "v1",
		"kind":       "ConfigMap",
		"metadata": map[string]any{
			"name":      name,
			"namespace": testNS,
		},
		"data": data,
	}
}

// cmData pulls the typed data map back out of a returned object.
func cmData(t *testing.T, obj k8s.Object) map[string]any {
	t.Helper()
	d, ok := obj["data"].(map[string]any)
	if !ok {
		t.Fatalf("returned object has no data map: %#v", obj["data"])
	}
	return d
}

func ref(name string) k8s.Ref {
	return k8s.Ref{
		GVR:       k8s.GVR{Group: "", Version: "v1", Resource: "configmaps"},
		Namespace: testNS,
		Name:      name,
	}
}

func ctxT(t *testing.T) context.Context {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	t.Cleanup(cancel)
	return ctx
}

// TestIntegrationSSA exercises the real SSA merge / conflict / dry-run
// semantics of Apply and Delete against a live apiserver.
func TestIntegrationSSA(t *testing.T) {
	c := newReal(t)

	// a. Create via SSA.
	t.Run("CreateViaSSA", func(t *testing.T) {
		ctx := ctxT(t)
		name := "cm-create"
		applied, err := c.Apply(ctx, configMap(name, map[string]any{"a": "1"}), k8s.ApplyOptions{FieldManager: "kestrel"})
		if err != nil {
			t.Fatalf("Apply(create): %v", err)
		}
		if got := cmData(t, applied); got["a"] != "1" {
			t.Fatalf("returned data[a] = %v, want 1", got["a"])
		}
		got, err := c.Get(ctx, ref(name))
		if err != nil {
			t.Fatalf("Get after create: %v", err)
		}
		if d := cmData(t, got); d["a"] != "1" {
			t.Fatalf("Get data[a] = %v, want 1", d["a"])
		}
	})

	// b. Merge: second apply by the same manager adds a key and removes another.
	t.Run("Merge", func(t *testing.T) {
		ctx := ctxT(t)
		name := "cm-merge"
		if _, err := c.Apply(ctx, configMap(name, map[string]any{"keep": "x", "drop": "y"}), k8s.ApplyOptions{FieldManager: "kestrel"}); err != nil {
			t.Fatalf("Apply(first): %v", err)
		}
		// Second apply: keep "keep", drop "drop" (absent => removed under SSA for
		// the same manager), add "new".
		applied, err := c.Apply(ctx, configMap(name, map[string]any{"keep": "x", "new": "z"}), k8s.ApplyOptions{FieldManager: "kestrel"})
		if err != nil {
			t.Fatalf("Apply(second): %v", err)
		}
		d := cmData(t, applied)
		if d["keep"] != "x" {
			t.Fatalf("data[keep] = %v, want x", d["keep"])
		}
		if d["new"] != "z" {
			t.Fatalf("data[new] = %v, want z", d["new"])
		}
		if _, exists := d["drop"]; exists {
			t.Fatalf("data[drop] still present after being dropped by same manager: %#v", d)
		}
	})

	// c. 409 on conflict, then Force overrides.
	t.Run("ConflictThenForce", func(t *testing.T) {
		ctx := ctxT(t)
		name := "cm-conflict"
		// A different manager owns data.shared=x.
		if _, err := c.Apply(ctx, configMap(name, map[string]any{"shared": "x"}), k8s.ApplyOptions{FieldManager: "other"}); err != nil {
			t.Fatalf("Apply(other): %v", err)
		}
		// kestrel tries to set shared=y without Force => 409 Conflict.
		_, err := c.Apply(ctx, configMap(name, map[string]any{"shared": "y"}), k8s.ApplyOptions{FieldManager: "kestrel", Force: false})
		if err == nil {
			t.Fatalf("expected a conflict error, got nil")
		}
		var se *k8s.StatusError
		if !errors.As(err, &se) {
			t.Fatalf("expected *k8s.StatusError, got %T: %v", err, err)
		}
		if se.Code != 409 {
			t.Fatalf("expected 409 Conflict, got code %d (%s): %s", se.Code, se.Reason, se.Message)
		}
		// With Force the apply succeeds and overwrites the value.
		applied, err := c.Apply(ctx, configMap(name, map[string]any{"shared": "y"}), k8s.ApplyOptions{FieldManager: "kestrel", Force: true})
		if err != nil {
			t.Fatalf("Apply(force): %v", err)
		}
		if d := cmData(t, applied); d["shared"] != "y" {
			t.Fatalf("after force data[shared] = %v, want y", d["shared"])
		}
	})

	// d. Dry-run does not persist.
	t.Run("DryRunDoesNotPersist", func(t *testing.T) {
		ctx := ctxT(t)
		name := "cm-dryrun"
		// Dry-run create returns a merged object but must NOT create it.
		applied, err := c.Apply(ctx, configMap(name, map[string]any{"a": "1"}), k8s.ApplyOptions{FieldManager: "kestrel", DryRun: true})
		if err != nil {
			t.Fatalf("Apply(dry-run create): %v", err)
		}
		if d := cmData(t, applied); d["a"] != "1" {
			t.Fatalf("dry-run returned data[a] = %v, want 1", d["a"])
		}
		_, err = c.Get(ctx, ref(name))
		if err == nil {
			t.Fatalf("object was persisted by a dry-run apply; expected NotFound")
		}
		var se *k8s.StatusError
		if !errors.As(err, &se) || se.Code != 404 {
			t.Fatalf("expected 404 NotFound after dry-run, got %v", err)
		}

		// Dry-run on an existing object must not mutate it.
		real := "cm-dryrun-existing"
		if _, err := c.Apply(ctx, configMap(real, map[string]any{"v": "orig"}), k8s.ApplyOptions{FieldManager: "kestrel"}); err != nil {
			t.Fatalf("Apply(create existing): %v", err)
		}
		if _, err := c.Apply(ctx, configMap(real, map[string]any{"v": "changed"}), k8s.ApplyOptions{FieldManager: "kestrel", DryRun: true}); err != nil {
			t.Fatalf("Apply(dry-run update): %v", err)
		}
		got, err := c.Get(ctx, ref(real))
		if err != nil {
			t.Fatalf("Get after dry-run update: %v", err)
		}
		if d := cmData(t, got); d["v"] != "orig" {
			t.Fatalf("dry-run mutated the stored object: data[v] = %v, want orig", d["v"])
		}
	})

	// e. Delete dry-run leaves the object; a real Delete removes it.
	t.Run("DeleteDryRunThenReal", func(t *testing.T) {
		ctx := ctxT(t)
		name := "cm-delete"
		if _, err := c.Apply(ctx, configMap(name, map[string]any{"a": "1"}), k8s.ApplyOptions{FieldManager: "kestrel"}); err != nil {
			t.Fatalf("Apply(create): %v", err)
		}
		// Dry-run delete must leave it present.
		if err := c.Delete(ctx, ref(name), k8s.DeleteOptions{DryRun: true}); err != nil {
			t.Fatalf("Delete(dry-run): %v", err)
		}
		if _, err := c.Get(ctx, ref(name)); err != nil {
			t.Fatalf("object missing after dry-run delete: %v", err)
		}
		// Real delete removes it.
		if err := c.Delete(ctx, ref(name), k8s.DeleteOptions{}); err != nil {
			t.Fatalf("Delete(real): %v", err)
		}
		_, err := c.Get(ctx, ref(name))
		if err == nil {
			t.Fatalf("object still present after real delete")
		}
		var se *k8s.StatusError
		if !errors.As(err, &se) || se.Code != 404 {
			t.Fatalf("expected 404 NotFound after delete, got %v", err)
		}
	})
}
