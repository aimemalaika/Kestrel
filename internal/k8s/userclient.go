package k8s

import (
	"context"
	"errors"

	"k8s.io/client-go/kubernetes"

	"github.com/aimemalaika/Kestrel/internal/auth"
)

// UserClientset returns a typed clientset authenticating as the user on ctx
// (their forwarded token), or the SA client when no token is present
// (single-operator). It fails closed (error) when a token is present but no
// rest.Config is available to build a per-user client.
//
// This keeps the credential-clearing boundary (userConfig) inside the k8s
// package: callers outside k8s (e.g. the helm module) get a per-user client
// without being able to reach the unexported userConfig themselves. It mirrors
// the token-forwarding pattern used by RealLogs.Stream exactly.
func UserClientset(ctx context.Context, acc ClusterAccessor) (kubernetes.Interface, error) {
	if token := auth.From(ctx).Token; token != "" {
		cfg := acc.RESTConfig()
		if cfg == nil {
			return nil, errors.New("rest config not configured")
		}
		k, err := kubernetes.NewForConfig(userConfig(cfg, token))
		if err != nil {
			return nil, mapErr(err)
		}
		return k, nil
	}
	return acc.Kubernetes(), nil
}
