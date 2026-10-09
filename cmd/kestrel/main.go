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

	"github.com/aimemalaika/Kestrel/internal/audit"
	"github.com/aimemalaika/Kestrel/internal/auth"
	"github.com/aimemalaika/Kestrel/internal/authn"
	"github.com/aimemalaika/Kestrel/internal/helm"
	"github.com/aimemalaika/Kestrel/internal/httpapi"
	"github.com/aimemalaika/Kestrel/internal/k8s"
	"github.com/aimemalaika/Kestrel/internal/obs"
	"github.com/aimemalaika/Kestrel/internal/registry"
	"github.com/aimemalaika/Kestrel/internal/resource"
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
	trustedProxy := flag.Bool("trusted-proxy", false, "trust X-Forwarded-For/X-Real-Ip for the client IP (enable ONLY behind a reverse proxy that rewrites these headers; default off is safe)")

	// OIDC login + token forwarding. If --oidc-issuer is empty, OIDC is disabled
	// and Kestrel runs as the single operator (its own ServiceAccount credentials).
	oidcIssuer := flag.String("oidc-issuer", "", "OIDC issuer URL; empty disables login (single-operator mode)")
	oidcClientID := flag.String("oidc-client-id", "", "OIDC client id")
	oidcClientSecret := flag.String("oidc-client-secret", "", "OIDC client secret")
	oidcRedirectURL := flag.String("oidc-redirect-url", "", "OIDC redirect URL (…/auth/callback)")
	oidcGroupsClaim := flag.String("oidc-groups-claim", "groups", "id_token claim carrying the user's groups")
	oidcUsernameClaim := flag.String("oidc-username-claim", "email", "id_token claim used for the display username")
	sessionKey := flag.String("session-key", "", "HMAC key for session cookies; empty generates a random key (sessions won't survive restart)")

	tlsCert := flag.String("tls-cert", "", "TLS certificate file; with --tls-key, serve HTTPS")
	tlsKey := flag.String("tls-key", "", "TLS key file; with --tls-cert, serve HTTPS")

	// Registry module (OCI Distribution v2 proxy). Empty --registry-url disables
	// it: /api/registry/* returns 503 "registry not configured".
	registryURL := flag.String("registry-url", "", "OCI registry base URL incl. scheme (e.g. https://registry.example.com); empty disables the registry module")
	registryUser := flag.String("registry-username", "", "registry basic-auth username (optional)")
	registryPass := flag.String("registry-password", "", "registry basic-auth password (optional)")
	registryInsecure := flag.Bool("registry-insecure-skip-verify", false, "skip TLS verification of the registry (do not use in production)")
	registryAllowDelete := flag.Bool("registry-allow-delete", false, "enable DELETE by digest on the registry (deletesEnabled)")

	// Helm module chart repositories. Repeatable (--helm-repo each) and/or
	// comma-separated within one value: --helm-repo "stable=https://charts.example.com,bitnami=https://charts.bitnami.com".
	var helmRepos helmRepoFlag
	flag.Var(&helmRepos, "helm-repo", "chart repo as name=url (repeatable, or comma-separated name=url[,name=url...])")
	flag.Parse()

	obs.SetupLogger(*logLevel)

	protected := resource.ProtectedSet(strings.Split(*protectedNS, ","))
	auditor := audit.NewStdoutAuditor(nil) // one JSON line per mutation to stdout

	dist, err := fs.Sub(web.Dist, "dist")
	if err != nil {
		fatal("embedded SPA assets", err)
	}
	deps := httpapi.DefaultDeps()
	deps.Registry = registry.NewHandler(registry.Config{
		URL:                *registryURL,
		Username:           *registryUser,
		Password:           *registryPass,
		InsecureSkipVerify: *registryInsecure,
		AllowDelete:        *registryAllowDelete,
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
		// Helm releases are read AS THE USER (token forwarding) via this accessor.
		deps.Helm = helm.NewHandler(acc, helm.Config{Repos: parsedRepos})
		deps.Resources = resource.NewServiceWith(k8s.NewReal(acc), protected, auditor)
		// #46: the per-user SSE read filter. The shared informer watches as the SA,
		// so every snapshot object and live delta is gated by a namespace-level SSAR
		// for the subscriber's own identity before it leaves the hub (fail closed).
		hub := stream.NewHubFromAccessor(acc, stream.WithAuthorizer(k8s.NewSSARAuthorizer(acc)))
		defer hub.Close()
		deps.Stream = hub
		deps.Logs = k8s.NewRealLogs(acc)
		deps.Exec = k8s.NewRealExec(acc)
		deps.PortForward = k8s.NewRealPortForward(acc)
		slog.Info("connected to cluster", slog.String("host", cfg.Host))
	} else {
		deps.Resources = resource.NewServiceWith(k8s.Stub{}, protected, auditor)
		// --mock: no cluster, so releases come back empty (no typed client), but
		// configured chart repos still resolve over HTTP.
		deps.Helm = helm.NewHandler(k8s.NewAccessorFromAll(nil, nil, nil), helm.Config{Repos: parsedRepos})
		slog.Info("running with --mock stub data")
	}

	mux := http.NewServeMux()

	// authn is the outer middleware; nil when OIDC is disabled.
	var authnMW func(http.Handler) http.Handler
	if *oidcIssuer != "" {
		key := sessionKeyBytes(*sessionKey)
		authr, err := authn.NewAuthenticator(context.Background(), authn.Config{
			Issuer:        *oidcIssuer,
			ClientID:      *oidcClientID,
			ClientSecret:  *oidcClientSecret,
			RedirectURL:   *oidcRedirectURL,
			GroupsClaim:   *oidcGroupsClaim,
			UsernameClaim: *oidcUsernameClaim,
		}, key)
		if err != nil {
			fatal("oidc setup", err)
		}
		defer authr.Close() // stop the session janitor on shutdown
		mux.HandleFunc("/auth/login", authr.Login)
		mux.HandleFunc("/auth/callback", authr.Callback)
		mux.HandleFunc("/auth/logout", authr.Logout)
		authnMW = authr.Middleware
		slog.Info("OIDC login enabled; forwarding user id_tokens to the apiserver",
			slog.String("issuer", *oidcIssuer))
		slog.Info("NOTE: the kube-apiserver must trust this SAME issuer for forwarded tokens to authenticate")
	} else {
		mux.Handle("/auth/", authn.NotConfiguredHandler())
		slog.Warn("OIDC disabled: --oidc-issuer not set; running as single operator, all /api uses Kestrel's own ServiceAccount credentials and no login is required",
			slog.String("operator", auth.Operator))
	}

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
	handler = obs.SecurityHeaders(handler)
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
