// Command kestrel is the single binary: /api/* plus the embedded SPA.
package main

import (
	"context"
	"crypto/rand"
	"flag"
	"fmt"
	"io/fs"
	"log/slog"
	"net/http"
	"os"
	"strings"

	"k8s.io/apimachinery/pkg/util/validation"

	"github.com/aimemalaika/Kestrel/internal/audit"
	"github.com/aimemalaika/Kestrel/internal/auth"
	"github.com/aimemalaika/Kestrel/internal/authn"
	"github.com/aimemalaika/Kestrel/internal/helm"
	"github.com/aimemalaika/Kestrel/internal/httpapi"
	"github.com/aimemalaika/Kestrel/internal/k8s"
	kubeconfigsvc "github.com/aimemalaika/Kestrel/internal/kubeconfig"
	"github.com/aimemalaika/Kestrel/internal/obs"
	"github.com/aimemalaika/Kestrel/internal/registry"
	"github.com/aimemalaika/Kestrel/internal/resource"
	"github.com/aimemalaika/Kestrel/internal/servicemap"
	"github.com/aimemalaika/Kestrel/internal/stream"
	"github.com/aimemalaika/Kestrel/web"
)

func main() {
	addr := flag.String("addr", ":8080", "listen address")
	kubeconfig := flag.String("kubeconfig", "", "path to kubeconfig (default: in-cluster, $KUBECONFIG, ~/.kube/config)")
	mock := flag.Bool("mock", false, "serve stub data instead of connecting to a cluster")
	protectedNS := flag.String("protected-namespaces", strings.Join(resource.DefaultProtectedNamespaces, ","),
		"comma-separated namespaces hard-blocked for apply/delete (empty disables the guard)")

	// Observability + protection (B9).
	metricsAddr := flag.String("metrics-addr", ":9090", "Prometheus /metrics listen address on a SEPARATE listener (empty disables)")
	logLevel := flag.String("log-level", "info", "log level: debug|info|warn|error")
	rateLimit := flag.Float64("rate-limit", 20, "per-caller request rate (req/sec); 0 disables rate limiting")
	rateBurst := flag.Int("rate-burst", 40, "per-caller burst size for the rate limiter")
	trustedProxy := flag.Bool("trusted-proxy", false, "trust X-Forwarded-For/X-Real-Ip for the client IP and X-Forwarded-Proto for the request scheme (enable ONLY behind a reverse proxy that rewrites these headers; default off is safe)")
	csp := flag.String("csp", obs.DefaultCSP, "Content-Security-Policy header value (crafted for the built SPA); pass --csp=\"\" to disable the CSP header")

	// OIDC login + token forwarding. If --oidc-issuer is empty, OIDC is disabled
	// and Kestrel runs as the single operator (its own ServiceAccount credentials).
	oidcIssuer := flag.String("oidc-issuer", "", "OIDC issuer URL; empty disables login (single-operator mode)")
	oidcClientID := flag.String("oidc-client-id", "", "OIDC client id")
	oidcClientSecret := flag.String("oidc-client-secret", "", "OIDC client secret (falls back to $KESTREL_OIDC_CLIENT_SECRET when empty)")
	oidcRedirectURL := flag.String("oidc-redirect-url", "", "OIDC redirect URL (…/auth/callback)")
	oidcGroupsClaim := flag.String("oidc-groups-claim", "groups", "id_token claim carrying the user's groups")
	oidcUsernameClaim := flag.String("oidc-username-claim", "email", "id_token claim used for the display username")
	oidcGitHubConnector := flag.String("oidc-github-connector", "", "Dex/Keycloak connector id for the \"Log in with GitHub\" option; empty hides it (the broker handles the GitHub OAuth + org→groups mapping)")
	oidcPasswordConnector := flag.String("oidc-password-connector", "", "connector id for the username/password option (redirect-to-IdP); empty + --oidc-password-enable=false hides it")
	oidcPasswordEnable := flag.Bool("oidc-password-enable", false, "enable the native username/password form (ROPC relay to the broker token endpoint); use only when a redirect connector is not viable")
	sessionKey := flag.String("session-key", "", "HMAC key for session cookies (falls back to $KESTREL_SESSION_KEY when empty); empty generates a random key (sessions won't survive restart)")

	tlsCert := flag.String("tls-cert", "", "TLS certificate file; with --tls-key, serve HTTPS")
	tlsKey := flag.String("tls-key", "", "TLS key file; with --tls-cert, serve HTTPS")

	// Registry module (OCI Distribution v2 proxy). Empty --registry-url disables
	// it: /api/registry/* returns 503 "registry not configured".
	registryURL := flag.String("registry-url", "", "OCI registry base URL incl. scheme (e.g. https://registry.example.com); empty disables the registry module")
	registryUser := flag.String("registry-username", "", "registry basic-auth username (optional)")
	registryPass := flag.String("registry-password", "", "registry basic-auth password (optional; falls back to $KESTREL_REGISTRY_PASSWORD when empty)")
	registryInsecure := flag.Bool("registry-insecure-skip-verify", false, "skip TLS verification of the registry (do not use in production)")
	registryAllowDelete := flag.Bool("registry-allow-delete", false, "enable DELETE by digest on the registry (deletesEnabled)")
	registryGroups := flag.String("registry-allowed-groups", "", "comma-separated OIDC groups allowed to use the registry module (empty = any authenticated user; not enforced in single-operator mode)")
	pfTimeout := flag.Duration("port-forward-idle-timeout", 0, "max lifetime of a port-forward session before it is torn down (0 = unbounded; abandoned forwards already close within ~60s via keepalive)")

	// Helm module chart repositories. Repeatable (--helm-repo each) and/or
	// comma-separated within one value: --helm-repo "stable=https://charts.example.com,bitnami=https://charts.bitnami.com".
	var helmRepos helmRepoFlag
	flag.Var(&helmRepos, "helm-repo", "chart repo as name=url (repeatable, or comma-separated name=url[,name=url...])")

	// Service map module (B10). The uploaded services.yaml is persisted in this
	// ConfigMap (data key services.yaml). Form: [namespace/]name; namespace
	// defaults to the in-cluster ServiceAccount namespace, else "default".
	servicemapCM := flag.String("servicemap-configmap", "kestrel-servicemap",
		"ConfigMap for the service map as [namespace/]name; namespace defaults to the in-cluster SA namespace (else \"default\")")

	// Informer deny-list (#113). Comma-separated `resource` or `group/resource`
	// entries the shared informer refuses to watch (SSE), regardless of version.
	// Denied resources are still readable via get/list (per-user token) — only
	// live streaming is disabled. Default empty = no change.
	noWatch := flag.String("no-watch-resources", "",
		"comma-separated resources the shared informer refuses to watch (SSE), as `resource` or `group/resource` (version-agnostic); still readable via get/list. Default empty disables the deny-list")
	clusterName := flag.String("cluster-name", "", "display name for the connected cluster (falls back to $KESTREL_CLUSTER_NAME)")
	flag.Parse()

	// Env-native secret fallback (#113): keep secrets off the process command line.
	// An explicit non-empty flag always wins; otherwise fall back to the env var.
	sessionKeyVal := flagOrEnv(*sessionKey, "KESTREL_SESSION_KEY")
	oidcClientSecretVal := flagOrEnv(*oidcClientSecret, "KESTREL_OIDC_CLIENT_SECRET")
	registryPassVal := flagOrEnv(*registryPass, "KESTREL_REGISTRY_PASSWORD")

	obs.SetupLogger(*logLevel)

	protected := resource.ProtectedSet(strings.Split(*protectedNS, ","))
	auditor := audit.NewStdoutAuditor(nil) // one JSON line per mutation to stdout

	dist, err := fs.Sub(web.Dist, "dist")
	if err != nil {
		fatal("embedded SPA assets", err)
	}
	deps := httpapi.DefaultDeps()
	deps.PortForwardTimeout = *pfTimeout
	deps.ClusterName = flagOrEnv(*clusterName, "KESTREL_CLUSTER_NAME")
	deps.Registry = registry.NewHandler(registry.Config{
		URL:                *registryURL,
		Username:           *registryUser,
		Password:           registryPassVal,
		InsecureSkipVerify: *registryInsecure,
		AllowDelete:        *registryAllowDelete,
		AllowedGroups:      splitNonEmpty(*registryGroups),
	})
	if *registryURL == "" {
		slog.Warn("registry module disabled: --registry-url not set; /api/registry returns 503")
	} else {
		slog.Info("registry module enabled", slog.String("url", *registryURL), slog.Bool("deletes", *registryAllowDelete))
	}
	parsedRepos := helmRepos.repos()
	if len(parsedRepos) > 0 {
		slog.Info("helm module configured", slog.Int("repos", len(parsedRepos)))
	}
	smCfg := parseServiceMapConfig(*servicemapCM)
	slog.Info("service map module configured",
		slog.String("namespace", smCfg.Namespace), slog.String("configmap", smCfg.Name))
	if !*mock {
		cfg, err := k8s.LoadConfig(*kubeconfig)
		if err != nil {
			// Fail fast: a silently broken cluster connection is worse than no start.
			fatal("cannot connect to a cluster (use --mock for stub data, or --kubeconfig)", err)
		}
		acc, err := k8s.NewAccessor(cfg)
		if err != nil {
			fatal("cluster clients", err)
		}
		// Shared accessor for read-only cluster-info (server version + host). nil under --mock.
		deps.Accessor = acc
		// Helm releases are read AS THE USER (token forwarding) via this accessor.
		deps.Helm = helm.NewHandler(acc, helm.Config{Repos: parsedRepos})
		// Service map is read/written AS THE USER (token forwarding) via this accessor.
		deps.ServiceMap = servicemap.NewHandler(acc, smCfg)
		deps.Resources = resource.NewServiceWith(k8s.NewReal(acc), protected, auditor)
		// #46: the per-user SSE read filter. The shared informer watches as the SA,
		// so every snapshot object and live delta is gated by a namespace-level SSAR
		// for the subscriber's own identity before it leaves the hub (fail closed).
		hubOpts := []stream.HubOption{stream.WithAuthorizer(k8s.NewSSARAuthorizer(acc))}
		if deny := parseDenyResources(*noWatch); len(deny) > 0 {
			hubOpts = append(hubOpts, stream.WithDenyResources(deny))
			slog.Info("informer deny-list active: these resources cannot be live-streamed over SSE (still readable via get/list)",
				slog.String("resources", *noWatch))
		}
		hub := stream.NewHubFromAccessor(acc, hubOpts...)
		defer hub.Close()
		deps.Stream = hub
		deps.Logs = k8s.NewRealLogs(acc)
		deps.Exec = k8s.NewRealExec(acc)
		deps.PortForward = k8s.NewRealPortForward(acc)
		// Per-user kubeconfig download only makes sense with OIDC (a real user
		// identity + id_token). Host/CA come from the live rest.Config, never literals.
		if *oidcIssuer != "" {
			caData := cfg.CAData
			if len(caData) == 0 && cfg.CAFile != "" {
				if b, readErr := os.ReadFile(cfg.CAFile); readErr == nil {
					caData = b
				}
			}
			deps.Kubeconfig = kubeconfigsvc.Handler(kubeconfigsvc.Config{
				Issuer:      *oidcIssuer,
				ClientID:    *oidcClientID,
				APIServer:   cfg.Host,
				CAData:      caData,
				ClusterName: deps.ClusterName,
				TrustProxy:  *trustedProxy,
			})
		}
		slog.Info("connected to cluster", slog.String("host", cfg.Host))
	} else {
		deps.Resources = resource.NewServiceWith(k8s.Stub{}, protected, auditor)
		// --mock: no cluster, so releases come back empty (no typed client), but
		// configured chart repos still resolve over HTTP.
		deps.Helm = helm.NewHandler(k8s.NewAccessorFromAll(nil, nil, nil), helm.Config{Repos: parsedRepos})
		// --mock: no typed client, so the service map uses its in-memory fallback
		// (PUT validates + stores in memory, GET returns it) — no cluster required.
		deps.ServiceMap = servicemap.NewHandler(k8s.NewAccessorFromAll(nil, nil, nil), smCfg)
		slog.Info("running with --mock stub data")
	}

	mux := http.NewServeMux()

	// Liveness probe (#113). Registered on the MAIN serving port so a kubelet
	// probe exercises the real listener, but deliberately exempt from authn and
	// the rate limiter (a probe carries no session and must never be throttled):
	// both middlewares early-return for exactly this path (see healthzPath). No
	// cluster call — liveness only.
	mux.HandleFunc(healthzPath, healthz)

	// authn is the outer middleware; nil when OIDC is disabled.
	var authnMW func(http.Handler) http.Handler
	if *oidcIssuer != "" {
		key := sessionKeyBytes(sessionKeyVal)
		authr, err := authn.NewAuthenticator(context.Background(), authn.Config{
			Issuer:        *oidcIssuer,
			ClientID:      *oidcClientID,
			ClientSecret:  oidcClientSecretVal,
			RedirectURL:   *oidcRedirectURL,
			GroupsClaim:   *oidcGroupsClaim,
			UsernameClaim: *oidcUsernameClaim,
			TrustProxy:    *trustedProxy,
		}, key)
		if err != nil {
			fatal("oidc setup", err)
		}
		defer authr.Close() // stop the session janitor on shutdown
		mux.HandleFunc("/auth/login", authr.Login)
		mux.HandleFunc("/auth/callback", authr.Callback)
		mux.HandleFunc("/auth/logout", authr.Logout)
		// Native username/password (ROPC) endpoint, only when the operator enabled
		// the native form. It enforces POST itself (credentials never in a URL) and
		// is on the bare mux outside /api/, like the other /auth/* routes.
		if *oidcPasswordEnable {
			mux.HandleFunc("/auth/password", authr.PasswordLogin)
		}
		// Unauthenticated discovery endpoint (outside the /api/ authn gate, like
		// /healthz and /auth/*) so the SPA can learn the mode + login options and
		// the current user (best-effort, when a session is present). Options are
		// built purely from flags — the operator must enable at least one method.
		mux.Handle("/authinfo", authn.AuthInfoHandler(authn.AuthInfo{
			Mode: "oidc",
			Options: authn.BuildOptions(authn.OptionsConfig{
				GitHubConnector:   *oidcGitHubConnector,
				PasswordConnector: *oidcPasswordConnector,
				PasswordEnable:    *oidcPasswordEnable,
			}),
		}, authr))
		authnMW = authr.Middleware
		slog.Info("OIDC login enabled; forwarding user id_tokens to the apiserver",
			slog.String("issuer", *oidcIssuer))
		slog.Info("NOTE: the kube-apiserver must trust this SAME issuer for forwarded tokens to authenticate")
	} else {
		mux.Handle("/auth/", authn.NotConfiguredHandler())
		// Single-operator: no login, so /authinfo advertises no options and reports
		// the operator identity the SPA enters as directly.
		mux.Handle("/authinfo", authn.AuthInfoHandler(
			authn.AuthInfo{Mode: "single-operator", User: &authn.AuthUser{Name: auth.Operator}},
			nil,
		))
		slog.Warn("OIDC disabled: --oidc-issuer not set; running as single operator, all /api uses Kestrel's own ServiceAccount credentials and no login is required",
			slog.String("operator", auth.Operator))
	}

	// The WebSocket origin check trusts X-Forwarded-Proto only under --trusted-proxy,
	// consistent with the authn/obs scheme checks and the rate-limiter's XFF gating.
	httpapi.SetWSTrustProxy(*trustedProxy)

	mux.Handle("/api/", httpapi.New(deps))
	mux.Handle("/", httpapi.SPA(dist))

	// Observability + protection middleware. Outermost→innermost:
	//   recovery → security-headers → request-logging → metrics → authn → rate-limit → mux
	// Rate limiting is INNER of authn so the authenticated user is already on the
	// context (keying per-user); authn 401s unauthenticated /api before it, while
	// public paths (/auth/*, SPA) pass through authn and are limited by IP.
	metrics := obs.NewMetrics()
	limiter := obs.NewRateLimiter(*rateLimit, *rateBurst, *trustedProxy)
	defer limiter.Close()

	var handler http.Handler = mux
	handler = limiter.Middleware(handler)
	if authnMW != nil {
		handler = authnMW(handler)
	}
	handler = metrics.Middleware(handler)
	handler = obs.RequestLogger(handler, *trustedProxy)
	// SecurityHeaders is an OUTER middleware (just inside recovery) so baseline
	// security headers apply to everything: the SPA and all of /api. It sets
	// headers before delegating and does not wrap the ResponseWriter, so SSE/WS
	// (Flusher/Hijacker) are unaffected.
	handler = obs.SecurityHeaders(*csp, *trustedProxy, handler)
	handler = obs.Recovery(handler)

	// /metrics on a SEPARATE listener — NOT behind authn (a scraper has no
	// session). Empty --metrics-addr disables it.
	if *metricsAddr != "" {
		msrv := &http.Server{Addr: *metricsAddr, Handler: metricsMux(metrics)}
		go func() {
			slog.Info("metrics listening", slog.String("addr", *metricsAddr), slog.String("path", "/metrics"))
			if err := msrv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
				slog.Error("metrics server stopped", slog.Any("error", err))
			}
		}()
	}

	slog.Info("kestrel listening", slog.String("addr", *addr))
	if *tlsCert != "" && *tlsKey != "" {
		slog.Info("serving HTTPS (TLS)")
		fatal("http server", http.ListenAndServeTLS(*addr, *tlsCert, *tlsKey, handler))
	} else {
		fatal("http server", http.ListenAndServe(*addr, handler))
	}
}

// healthzPath is the liveness endpoint. It is referenced by the authn and
// rate-limit middlewares (internal/authn, internal/obs) which both bypass it so
// an unauthenticated, unthrottled kubelet probe always reaches it.
const healthzPath = "/healthz"

// healthz is a trivial liveness handler: it never touches the cluster and
// always returns 200 as long as the process is serving.
func healthz(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(`{"status":"ok"}`))
}

// flagOrEnv returns flagVal when it is non-empty, otherwise the value of the
// named environment variable (which may itself be empty). Used so secrets can be
// supplied via the environment and never land on the process command line.
func flagOrEnv(flagVal, envName string) string {
	if flagVal != "" {
		return flagVal
	}
	return os.Getenv(envName)
}

// parseDenyResources parses the --no-watch-resources value into deny-list GVRs.
// Each comma-separated entry is `resource` (core group) or `group/resource`;
// the version is left empty so matching is version-agnostic. Blank entries are
// skipped.
// splitNonEmpty splits a comma-separated flag value into trimmed, non-empty
// entries; empty input yields nil.
func splitNonEmpty(v string) []string {
	var out []string
	for _, e := range strings.Split(v, ",") {
		if e = strings.TrimSpace(e); e != "" {
			out = append(out, e)
		}
	}
	return out
}

func parseDenyResources(v string) []k8s.GVR {
	var out []k8s.GVR
	for _, e := range strings.Split(v, ",") {
		e = strings.TrimSpace(e)
		if e == "" {
			continue
		}
		group, resource := "", e
		if i := strings.IndexByte(e, '/'); i >= 0 {
			group, resource = strings.TrimSpace(e[:i]), strings.TrimSpace(e[i+1:])
		}
		// Treat the contract's "core" alias and a bare resource as the core group ("").
		if group == "core" {
			group = ""
		}
		if resource == "" {
			continue
		}
		out = append(out, k8s.GVR{Group: group, Resource: resource})
	}
	return out
}

// metricsMux serves the Prometheus exposition at /metrics on the dedicated
// listener.
func metricsMux(m *obs.Metrics) http.Handler {
	mux := http.NewServeMux()
	mux.Handle("/metrics", m.Handler())
	return mux
}

// fatal logs a fatal startup error via slog and exits non-zero (replacing the
// old log.Fatal calls so all output is structured JSON).
func fatal(msg string, err error) {
	slog.Error(msg, slog.Any("error", err))
	os.Exit(1)
}

// helmRepoFlag collects repeated --helm-repo values. Each value is one or more
// comma-separated name=url pairs. A later pair with the same name wins.
type helmRepoFlag struct {
	order  []string
	byName map[string]string
}

func (f *helmRepoFlag) String() string { return strings.Join(f.order, ",") }

func (f *helmRepoFlag) Set(v string) error {
	if f.byName == nil {
		f.byName = map[string]string{}
	}
	for _, pair := range strings.Split(v, ",") {
		pair = strings.TrimSpace(pair)
		if pair == "" {
			continue
		}
		name, url, ok := strings.Cut(pair, "=")
		name = strings.TrimSpace(name)
		url = strings.TrimSpace(url)
		if !ok || name == "" || url == "" {
			return fmt.Errorf("invalid --helm-repo %q: want name=url", pair)
		}
		if _, exists := f.byName[name]; !exists {
			f.order = append(f.order, name)
		}
		f.byName[name] = url
	}
	return nil
}

// repos renders the collected repos in first-seen order.
func (f *helmRepoFlag) repos() []helm.ChartRepo {
	out := make([]helm.ChartRepo, 0, len(f.order))
	for _, name := range f.order {
		out = append(out, helm.ChartRepo{Name: name, URL: f.byName[name]})
	}
	return out
}

// parseServiceMapConfig parses the --servicemap-configmap value ([namespace/]name)
// into a servicemap.Config. A missing namespace resolves to the in-cluster SA
// namespace, falling back to "default"; a missing name falls back to the default.
func parseServiceMapConfig(v string) servicemap.Config {
	ns, name := "", strings.TrimSpace(v)
	if i := strings.IndexByte(name, '/'); i >= 0 {
		ns, name = strings.TrimSpace(name[:i]), strings.TrimSpace(name[i+1:])
	}
	if name == "" {
		name = "kestrel-servicemap"
	}
	if ns == "" {
		ns = currentNamespace()
	}
	// Fast-fail at startup on an invalid name/namespace rather than surfacing a
	// k8s 422 on the first PUT/GET.
	if errs := validation.IsDNS1123Subdomain(name); len(errs) > 0 {
		fatal("invalid --servicemap-configmap name", fmt.Errorf("%q: %s", name, strings.Join(errs, "; ")))
	}
	if errs := validation.IsDNS1123Label(ns); len(errs) > 0 {
		fatal("invalid --servicemap-configmap namespace", fmt.Errorf("%q: %s", ns, strings.Join(errs, "; ")))
	}
	return servicemap.Config{Namespace: ns, Name: name}
}

// currentNamespace returns the Pod's ServiceAccount namespace (when running in a
// cluster), falling back to "default" off-cluster.
func currentNamespace() string {
	const f = "/var/run/secrets/kubernetes.io/serviceaccount/namespace"
	if b, err := os.ReadFile(f); err == nil {
		if ns := strings.TrimSpace(string(b)); ns != "" {
			return ns
		}
	}
	return "default"
}

// minSessionKeyLen is the minimum accepted --session-key length. The key is an
// HMAC-SHA256 secret, so a short/low-entropy key is forgeable; require at least
// a full HMAC block's worth of bytes.
const minSessionKeyLen = 32

// sessionKeyBytes returns the HMAC key for session cookies. A provided
// --session-key is used verbatim (and must be at least minSessionKeyLen bytes);
// otherwise a random key is generated and a warning is logged (sessions won't
// survive a restart).
func sessionKeyBytes(flagVal string) []byte {
	if flagVal != "" {
		if len(flagVal) < minSessionKeyLen {
			fatal("session key", fmt.Errorf("--session-key too short: %d bytes, need at least %d", len(flagVal), minSessionKeyLen))
		}
		return []byte(flagVal)
	}
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		fatal("generate session key", err)
	}
	slog.Warn("--session-key not set: using a random key; sessions won't survive a restart")
	return b
}
