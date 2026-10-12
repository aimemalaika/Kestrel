// Package kubeconfig serves a logged-in user their own cluster credentials: a
// kubelogin-wired kubeconfig download (A1, no embedded token) or a short-lived
// "login command" built from their own session id_token (A2). Both are served
// inside the /api/* authn gate (identity guaranteed on the context), own-identity
// only, HTTPS-only, and fail closed.
package kubeconfig

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/aimemalaika/Kestrel/internal/auth"
	"k8s.io/apimachinery/pkg/runtime"
	clientcmdapi "k8s.io/client-go/tools/clientcmd/api"
	clientcmdlatest "k8s.io/client-go/tools/clientcmd/api/latest"
)

// Config is the non-secret data needed to render a kubeconfig. Issuer/ClientID
// come from the OIDC flags; APIServer/CAData/ClusterName come from the live
// rest.Config (never literals). TrustProxy mirrors --trusted-proxy handling.
type Config struct {
	Issuer      string
	ClientID    string
	APIServer   string // rest.Config.Host
	CAData      []byte // server CA (PEM)
	ClusterName string // display name for the kubeconfig context
	TrustProxy  bool   // honor X-Forwarded-Proto for the HTTPS check
}

const execAPIVersion = "client.authentication.k8s.io/v1beta1"

// Handler serves GET /api/kubeconfig (A1) and GET /api/kubeconfig/command (A2).
func Handler(cfg Config) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			w.Header().Set("Allow", http.MethodGet)
			httpError(w, http.StatusMethodNotAllowed, "use GET")
			return
		}
		if !isHTTPS(r, cfg.TrustProxy) {
			httpError(w, http.StatusBadRequest, "https required")
			return
		}
		// Behind the /api gate the identity is guaranteed, but check anyway (fail closed).
		id := auth.From(r.Context())
		if id.User == "" {
			httpError(w, http.StatusUnauthorized, "not authenticated")
			return
		}
		if strings.HasSuffix(r.URL.Path, "/command") {
			cfg.serveLoginCommand(w, id)
			return
		}
		cfg.serveDownload(w, id)
	})
}

// serveDownload (A1) writes a kubelogin-wired kubeconfig with NO bearer token:
// the user re-authenticates fresh via the oidc-login exec plugin.
func (cfg Config) serveDownload(w http.ResponseWriter, id auth.Identity) {
	const name = "kestrel"
	kc := clientcmdapi.NewConfig()
	kc.Clusters[name] = &clientcmdapi.Cluster{
		Server:                   cfg.APIServer,
		CertificateAuthorityData: cfg.CAData,
	}
	kc.AuthInfos[id.User] = &clientcmdapi.AuthInfo{
		Exec: &clientcmdapi.ExecConfig{
			APIVersion:      execAPIVersion,
			Command:         "kubectl",
			Args:            []string{"oidc-login", "get-token", "--oidc-issuer-url=" + cfg.Issuer, "--oidc-client-id=" + cfg.ClientID},
			InteractiveMode: clientcmdapi.IfAvailableExecInteractiveMode,
		},
	}
	ctxName := cfg.ClusterName
	if ctxName == "" {
		ctxName = name
	}
	kc.Contexts[ctxName] = &clientcmdapi.Context{Cluster: name, AuthInfo: id.User}
	kc.CurrentContext = ctxName

	out, err := runtime.Encode(clientcmdlatest.Codec, kc)
	if err != nil {
		httpError(w, http.StatusInternalServerError, "could not render kubeconfig")
		return
	}
	w.Header().Set("Content-Type", "application/yaml")
	w.Header().Set("Content-Disposition", `attachment; filename="kestrel-kubeconfig.yaml"`)
	w.Header().Set("Cache-Control", "no-store")
	_, _ = w.Write(out)
}

// serveLoginCommand (A2) returns a one-shot kubectl command embedding the
// caller's OWN short-lived id_token. Sensitive — no-store, HTTPS-only.
func (cfg Config) serveLoginCommand(w http.ResponseWriter, id auth.Identity) {
	cluster := cfg.ClusterName
	if cluster == "" {
		cluster = "kestrel"
	}
	// A compact, copy-pasteable sequence that wires a context using the user's token.
	cmd := fmt.Sprintf(
		"kubectl config set-cluster %[1]s --server=%[2]s && "+
			"kubectl config set-credentials %[3]s --token=%[4]s && "+
			"kubectl config set-context %[1]s --cluster=%[1]s --user=%[3]s && "+
			"kubectl config use-context %[1]s",
		cluster, cfg.APIServer, id.User, id.Token,
	)
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	_ = json.NewEncoder(w).Encode(map[string]string{"command": cmd})
}

// isHTTPS reports whether the request arrived over TLS (or, under trustProxy, via
// a proxy that set X-Forwarded-Proto: https). Mirrors authn.isHTTPS; copied here
// to avoid an import cycle with internal/authn.
func isHTTPS(r *http.Request, trustProxy bool) bool {
	if r.TLS != nil {
		return true
	}
	if trustProxy && strings.EqualFold(r.Header.Get("X-Forwarded-Proto"), "https") {
		return true
	}
	return false
}

func httpError(w http.ResponseWriter, code int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(map[string]any{"error": msg, "code": code, "reason": http.StatusText(code)})
}
