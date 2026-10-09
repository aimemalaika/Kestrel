package k8s

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"reflect"
	"testing"

	"k8s.io/client-go/rest"
	clientcmdapi "k8s.io/client-go/tools/clientcmd/api"

	"github.com/aimemalaika/Kestrel/internal/auth"
)

// saConfig is a base config loaded with every kind of ambient/SA credential,
// so userConfig's clearing can be asserted exhaustively.
func saConfig() *rest.Config {
	return &rest.Config{
		Host:            "https://api.example.com:6443",
		BearerToken:     "sa-bearer-token",
		BearerTokenFile: "/var/run/secrets/kubernetes.io/serviceaccount/token",
		Username:        "sa-user",
		Password:        "sa-pass",
		AuthProvider:    &clientcmdapi.AuthProviderConfig{Name: "gcp"},
		ExecProvider:    &clientcmdapi.ExecConfig{Command: "aws"},
		TLSClientConfig: rest.TLSClientConfig{
			Insecure:   false,
			ServerName: "api.example.com",
			CAData:     []byte("CA-PEM-DATA"),
			CAFile:     "/etc/ca.crt",
			CertData:   []byte("CLIENT-CERT"),
			CertFile:   "/etc/client.crt",
			KeyData:    []byte("CLIENT-KEY"),
			KeyFile:    "/etc/client.key",
		},
	}
}

// TestUserConfigClearsCredentialsKeepsTLS is the anti-credential-leak test: the
// derived config authenticates ONLY with the user token, every SA/ambient
// credential is gone, and the apiserver endpoint + TLS trust are preserved.
func TestUserConfigClearsCredentialsKeepsTLS(t *testing.T) {
	base := saConfig()
	// Ambient impersonation + credential-injecting transport hooks that forwarded
	// user calls must NOT inherit (FIX 4).
	base.Impersonate = rest.ImpersonationConfig{UserName: "system:admin", Groups: []string{"system:masters"}}
	base.WrapTransport = func(rt http.RoundTripper) http.RoundTripper { return rt }
	base.Transport = http.DefaultTransport
	base.Dial = func(context.Context, string, string) (net.Conn, error) { return nil, nil }
	base.Proxy = func(*http.Request) (*url.URL, error) { return nil, nil }

	const userToken = "user-id-token-xyz"
	cfg := userConfig(base, userToken)

	// Defense-in-depth: impersonation + transport hooks must be gone.
	if !reflect.DeepEqual(cfg.Impersonate, rest.ImpersonationConfig{}) {
		t.Errorf("Impersonate not cleared: %+v", cfg.Impersonate)
	}
	if cfg.WrapTransport != nil {
		t.Error("WrapTransport not cleared")
	}
	if cfg.Transport != nil {
		t.Error("Transport not cleared")
	}
	if cfg.Dial != nil {
		t.Error("Dial not cleared")
	}
	if cfg.Proxy != nil {
		t.Error("Proxy not cleared")
	}

	// Only the user token authenticates.
	if cfg.BearerToken != userToken {
		t.Errorf("BearerToken = %q, want user token %q", cfg.BearerToken, userToken)
	}
	// Every SA/ambient credential must be cleared.
	if cfg.BearerTokenFile != "" {
		t.Errorf("BearerTokenFile not cleared: %q", cfg.BearerTokenFile)
	}
	if cfg.Username != "" || cfg.Password != "" {
		t.Errorf("Username/Password not cleared: %q/%q", cfg.Username, cfg.Password)
	}
	if cfg.AuthProvider != nil {
		t.Errorf("AuthProvider not cleared: %+v", cfg.AuthProvider)
	}
	if cfg.ExecProvider != nil {
		t.Errorf("ExecProvider not cleared: %+v", cfg.ExecProvider)
	}
	if cfg.TLSClientConfig.CertFile != "" || cfg.TLSClientConfig.KeyFile != "" {
		t.Errorf("client cert/key file not cleared: %q/%q", cfg.TLSClientConfig.CertFile, cfg.TLSClientConfig.KeyFile)
	}
	if cfg.TLSClientConfig.CertData != nil || cfg.TLSClientConfig.KeyData != nil {
		t.Errorf("client cert/key data not cleared: %v/%v", cfg.TLSClientConfig.CertData, cfg.TLSClientConfig.KeyData)
	}
	// Server endpoint + CA trust MUST be preserved so TLS still verifies.
	if cfg.Host != base.Host {
		t.Errorf("Host not preserved: %q", cfg.Host)
	}
	if string(cfg.TLSClientConfig.CAData) != "CA-PEM-DATA" || cfg.TLSClientConfig.CAFile != "/etc/ca.crt" {
		t.Errorf("CA not preserved: data=%q file=%q", cfg.TLSClientConfig.CAData, cfg.TLSClientConfig.CAFile)
	}
	if cfg.TLSClientConfig.ServerName != "api.example.com" || cfg.TLSClientConfig.Insecure {
		t.Errorf("ServerName/Insecure not preserved: %q/%v", cfg.TLSClientConfig.ServerName, cfg.TLSClientConfig.Insecure)
	}

	// The base config must be untouched (CopyConfig semantics).
	if base.BearerToken != "sa-bearer-token" || base.TLSClientConfig.CertData == nil {
		t.Errorf("userConfig mutated the base config")
	}
}

func ctxTok(token string) context.Context {
	return auth.WithIdentity(context.Background(), auth.Identity{User: "u", Token: token})
}

// TestClientsForCache: a token yields a stable cached pair; distinct tokens get
// distinct clients; an empty token returns the shared SA clients.
func TestClientsForCache(t *testing.T) {
	// A buildable base config (NewAccessor builds real clients from it; no network
	// occurs until a call is made). A full saConfig with both auth+exec providers
	// is rejected by client construction, so keep this minimal.
	base := &rest.Config{Host: "https://api.example.com:6443",
		TLSClientConfig: rest.TLSClientConfig{Insecure: true}}
	acc, err := NewAccessor(base)
	if err != nil {
		t.Fatalf("accessor: %v", err)
	}
	c := NewReal(acc)

	d1, k1 := c.clientsFor(ctxTok("tok-A"))
	d1b, k1b := c.clientsFor(ctxTok("tok-A"))
	if d1 == nil || k1 == nil {
		t.Fatal("nil clients for a non-empty token")
	}
	if d1 != d1b || k1 != k1b {
		t.Error("same token should return the SAME cached client instances")
	}

	d2, k2 := c.clientsFor(ctxTok("tok-B"))
	if d1 == d2 || k1 == k2 {
		t.Error("different tokens should return DIFFERENT client instances")
	}

	// Empty token ⇒ the shared SA clients (single-operator behavior).
	db, kb := c.clientsFor(context.Background())
	if db != acc.Dynamic() || kb != acc.Kubernetes() {
		t.Error("empty token should return the base SA clients")
	}
	if db == d1 {
		t.Error("SA dynamic client must not equal a per-user client")
	}
}

// TestClientsForCacheBounded covers FIX 5: the per-token client cache is capped,
// so a stream of rotating tokens cannot grow it without bound.
func TestClientsForCacheBounded(t *testing.T) {
	base := &rest.Config{Host: "https://api.example.com:6443",
		TLSClientConfig: rest.TLSClientConfig{Insecure: true}}
	acc, err := NewAccessor(base)
	if err != nil {
		t.Fatalf("accessor: %v", err)
	}
	c := NewReal(acc)

	for i := 0; i < maxUserClients*3; i++ {
		if d, k := c.clientsFor(ctxTok(fmt.Sprintf("tok-%d", i))); d == nil || k == nil {
			t.Fatalf("nil clients at i=%d", i)
		}
		if got := len(c.cache); got > maxUserClients {
			t.Fatalf("cache grew past cap: %d > %d (at i=%d)", got, maxUserClients, i)
		}
	}
}
