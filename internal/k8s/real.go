package k8s

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"sort"
	"strings"
	"sync"

	authzv1 "k8s.io/api/authorization/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/api/meta"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/discovery"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"

	"github.com/aimemalaika/Kestrel/internal/auth"
)

// Real is the client-go-backed Client implementing the full CRUD seam
// (Catalog, List, Get, Apply, Delete, CanI).
//
// Token forwarding (B7): List/Get/Apply/Delete/CanI run as the user whose OIDC
// token rides on ctx. Discovery and the RESTMapper stay shared as the SA (API
// shape is non-sensitive). Per-user dynamic/typed clients are built lazily from
// userConfig and cached by token.
type Real struct {
	acc ClusterAccessor

	mu    sync.Mutex
	cache map[string]userClients
}

// maxUserClients caps the per-token client cache so it cannot grow without
// bound (tokens rotate on every refresh, orphaning old entries).
const maxUserClients = 256

// userClients is one per-token client pair.
type userClients struct {
	dyn  dynamic.Interface
	kube kubernetes.Interface
}

// NewReal returns a Client over the given cluster accessor.
func NewReal(acc ClusterAccessor) *Real {
	return &Real{acc: acc, cache: map[string]userClients{}}
}

// Identity returns the identity carried by ctx (single-operator default when
// none).
func (c *Real) Identity(ctx context.Context) auth.Identity { return auth.From(ctx) }

// userConfig derives a per-user rest.Config that authenticates ONLY with the
// user's bearer token. It strips every ambient/SA credential so the user's
// token can never ride alongside Kestrel's own client cert or SA token, while
// preserving the apiserver endpoint and its TLS trust (Host + server CA) so the
// connection still verifies. This is the anti-credential-leak boundary.
func userConfig(base *rest.Config, token string) *rest.Config {
	cfg := rest.CopyConfig(base)
	// Clear all ambient / ServiceAccount credentials.
	cfg.BearerToken = ""
	cfg.BearerTokenFile = ""
	cfg.Username = ""
	cfg.Password = ""
	cfg.AuthProvider = nil
	cfg.ExecProvider = nil
	cfg.TLSClientConfig.CertFile = ""
	cfg.TLSClientConfig.KeyFile = ""
	cfg.TLSClientConfig.CertData = nil
	cfg.TLSClientConfig.KeyData = nil
	// Defense-in-depth: drop any ambient impersonation and transport-level auth
	// hooks. These are zero on a stock in-cluster/SA config, but if an operator
	// points Kestrel at a kubeconfig that impersonates or injects credentials via
	// a transport, forwarded user calls must NOT inherit that ambient auth.
	cfg.Impersonate = rest.ImpersonationConfig{}
	cfg.WrapTransport = nil
	cfg.Transport = nil
	cfg.Dial = nil
	cfg.Proxy = nil
	// Keep Host and server CA / ServerName / Insecure (set by CopyConfig) so TLS
	// to the apiserver still verifies.
	cfg.BearerToken = token
	return cfg
}

// clientsFor returns the dynamic + typed clients to use for ctx. With no token
// (OIDC off / single-operator) it returns the shared SA clients — today's
// behavior. With a token it returns a cached per-user pair built from
// userConfig, so each user's calls authenticate as themselves.
func (c *Real) clientsFor(ctx context.Context) (dynamic.Interface, kubernetes.Interface) {
	token := auth.From(ctx).Token
	base := c.acc.RESTConfig()
	if token == "" || base == nil {
		// No token, or an accessor with no rest.Config (test fakes): fall back to
		// the shared SA clients.
		return c.acc.Dynamic(), c.acc.Kubernetes()
	}

	c.mu.Lock()
	defer c.mu.Unlock()
	if uc, ok := c.cache[token]; ok {
		return uc.dyn, uc.kube
	}
	cfg := userConfig(base, token)
	dyn, derr := dynamic.NewForConfig(cfg)
	kube, kerr := kubernetes.NewForConfig(cfg)
	if derr != nil || kerr != nil {
		// Near-impossible (the base config already built working clients and we
		// keep its TLS), but never silently fall back to the SA: failing closed is
		// the safe choice for a security boundary. Return nil clients so the call
		// surfaces an error rather than running with SA privileges.
		slog.Error("per-user client build failed; failing closed", slog.Any("dyn_err", derr), slog.Any("kube_err", kerr))
		return nil, nil
	}
	// Bound the cache. The token rotates on every refresh, so entries orphan
	// forever; without a cap the map grows unbounded. A precise LRU is not needed
	// here — when the cap is reached, drop everything and let it refill (each
	// in-flight user simply rebuilds its pair once more).
	if len(c.cache) >= maxUserClients {
		c.cache = map[string]userClients{}
	}
	c.cache[token] = userClients{dyn: dyn, kube: kube}
	return dyn, kube
}

func (c *Real) Catalog(context.Context) ([]CatalogEntry, error) {
	lists, err := discovery.ServerPreferredResources(c.acc.Discovery())
	if err != nil && len(lists) == 0 {
		return nil, mapErr(err)
	}
	// Partial discovery failures (e.g. broken aggregated APIs) are tolerated.
	entries := []CatalogEntry{}
	for _, l := range lists {
		gv, perr := schema.ParseGroupVersion(l.GroupVersion)
		if perr != nil {
			continue
		}
		for _, r := range l.APIResources {
			if strings.Contains(r.Name, "/") {
				continue // subresource
			}
			entries = append(entries, CatalogEntry{
				Group: gv.Group, Version: gv.Version, Resource: r.Name, Kind: r.Kind,
				Namespaced: r.Namespaced, Verbs: append([]string{}, r.Verbs...),
			})
		}
	}
	sort.Slice(entries, func(i, j int) bool {
		a, b := entries[i], entries[j]
		if a.Group != b.Group {
			return a.Group < b.Group
		}
		return a.Resource < b.Resource
	})
	return entries, nil
}

// errNoClient is returned when a per-user client could not be built (failing
// closed rather than silently running as the SA).
func errNoClient() error {
	return &StatusError{Code: http.StatusInternalServerError, Reason: "InternalError",
		Message: "could not build a Kubernetes client for the request identity"}
}

// resourceClient picks the namespaced or cluster-scoped dynamic client from the
// supplied dynamic client, using the RESTMapper (shared SA discovery) to learn
// scope (falling back to the ref's namespace).
func (c *Real) resourceClient(dyn dynamic.Interface, ref Ref) dynamic.ResourceInterface {
	gvr := schema.GroupVersionResource{Group: ref.Group, Version: ref.Version, Resource: ref.Resource}
	ri := dyn.Resource(gvr)
	if ref.Namespace == "" {
		return ri
	}
	if kind, err := c.acc.Mapper().KindFor(gvr); err == nil {
		if m, err := c.acc.Mapper().RESTMapping(kind.GroupKind(), kind.Version); err == nil && m.Scope.Name() == meta.RESTScopeNameRoot {
			return ri
		}
	}
	return ri.Namespace(ref.Namespace)
}

func (c *Real) List(ctx context.Context, ref Ref, opts ListOptions) ([]Object, error) {
	dyn, _ := c.clientsFor(ctx)
	if dyn == nil {
		return nil, errNoClient()
	}
	l, err := c.resourceClient(dyn, ref).List(ctx, metav1.ListOptions{
		LabelSelector: opts.LabelSelector,
		FieldSelector: opts.FieldSelector,
	})
	if err != nil {
		return nil, mapErr(err)
	}
	out := make([]Object, 0, len(l.Items))
	for i := range l.Items {
		out = append(out, l.Items[i].Object)
	}
	return out, nil
}

func (c *Real) Get(ctx context.Context, ref Ref) (Object, error) {
	dyn, _ := c.clientsFor(ctx)
	if dyn == nil {
		return nil, errNoClient()
	}
	o, err := c.resourceClient(dyn, ref).Get(ctx, ref.Name, metav1.GetOptions{})
	if err != nil {
		return nil, mapErr(err)
	}
	return o.Object, nil
}

// Apply performs a dynamic-client Server-Side Apply. It resolves the object's
// GVR and scope from its apiVersion/kind via the RESTMapper, so no pre-built
// Ref is needed. DryRun runs real admission (DryRunAll) and returns the merged
// object without persisting. Force (default false) lets conflicts surface as
// 409 unless the caller opts in.
func (c *Real) Apply(ctx context.Context, obj Object, opts ApplyOptions) (Object, error) {
	u := &unstructured.Unstructured{Object: obj}
	apiVersion := u.GetAPIVersion()
	kind := u.GetKind()
	name := u.GetName()
	if apiVersion == "" || kind == "" || name == "" {
		return nil, &StatusError{Code: http.StatusBadRequest, Reason: "BadRequest",
			Message: "apply requires apiVersion, kind and metadata.name"}
	}
	gv, err := schema.ParseGroupVersion(apiVersion)
	if err != nil {
		return nil, &StatusError{Code: http.StatusBadRequest, Reason: "BadRequest",
			Message: "invalid apiVersion " + apiVersion + ": " + err.Error()}
	}
	mapping, err := c.acc.Mapper().RESTMapping(gv.WithKind(kind).GroupKind(), gv.Version)
	if err != nil {
		return nil, mapErr(err)
	}
	dyn, _ := c.clientsFor(ctx)
	if dyn == nil {
		return nil, errNoClient()
	}
	ri := dyn.Resource(mapping.Resource)
	var client dynamic.ResourceInterface = ri
	if mapping.Scope.Name() == meta.RESTScopeNameNamespace {
		client = ri.Namespace(u.GetNamespace())
	}

	fm := opts.FieldManager
	if fm == "" {
		fm = DefaultFieldManager
	}
	var dryRun []string
	if opts.DryRun {
		dryRun = []string{metav1.DryRunAll}
	}
	applied, err := client.Apply(ctx, name, u, metav1.ApplyOptions{
		FieldManager: fm,
		Force:        opts.Force,
		DryRun:       dryRun,
	})
	if err != nil {
		return nil, mapErr(err)
	}
	return applied.Object, nil
}

// Delete removes the referenced object with Background propagation (kubectl's
// default). DryRun runs admission without removing anything.
func (c *Real) Delete(ctx context.Context, ref Ref, opts DeleteOptions) error {
	dyn, _ := c.clientsFor(ctx)
	if dyn == nil {
		return errNoClient()
	}
	background := metav1.DeletePropagationBackground
	var dryRun []string
	if opts.DryRun {
		dryRun = []string{metav1.DryRunAll}
	}
	err := c.resourceClient(dyn, ref).Delete(ctx, ref.Name, metav1.DeleteOptions{
		PropagationPolicy: &background,
		DryRun:            dryRun,
	})
	if err != nil {
		return mapErr(err)
	}
	return nil
}

// CanI runs a SelfSubjectAccessReview as the USER on ctx (B7 token forwarding):
// the SSAR is created with the user's typed client, so the apiserver answers
// "can *this user* do X" under real RBAC. With no token it runs as the SA
// (single-operator). The Group arriving here is the internal group ("" for
// core); resource.Service maps "core" before calling.
func (c *Real) CanI(ctx context.Context, req CanIRequest) (bool, error) {
	_, kube := c.clientsFor(ctx)
	if kube == nil {
		return false, errNoClient()
	}
	ssar := &authzv1.SelfSubjectAccessReview{
		Spec: authzv1.SelfSubjectAccessReviewSpec{
			ResourceAttributes: &authzv1.ResourceAttributes{
				Verb:      req.Verb,
				Group:     req.Group,
				Version:   req.Version,
				Resource:  req.Resource,
				Namespace: req.Namespace,
				Name:      req.Name,
			},
		},
	}
	res, err := kube.AuthorizationV1().SelfSubjectAccessReviews().Create(ctx, ssar, metav1.CreateOptions{})
	if err != nil {
		return false, mapErr(err)
	}
	return res.Status.Allowed, nil
}

// mapErr converts API errors to *StatusError with the real code and reason.
func mapErr(err error) error {
	var st apierrors.APIStatus
	if errors.As(err, &st) {
		s := st.Status()
		code := int(s.Code)
		if code == 0 {
			code = 500 // some synthesized apierrors leave Code unset; never emit WriteHeader(0)
		}
		return &StatusError{Code: code, Reason: string(s.Reason), Message: s.Message}
	}
	return err
}
