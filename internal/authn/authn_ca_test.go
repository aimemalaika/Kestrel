package authn

import (
	"context"
	"crypto/x509"
	"encoding/json"
	"encoding/pem"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

func TestNewAuthenticator_CAFile(t *testing.T) {
	var srv *httptest.Server
	srv = httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/.well-known/openid-configuration" {
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]any{
				"issuer":                 srv.URL,
				"authorization_endpoint": srv.URL + "/auth",
				"token_endpoint":         srv.URL + "/token",
				"jwks_uri":               srv.URL + "/keys",
			})
			return
		}
		http.NotFound(w, r)
	}))
	defer srv.Close()

	// Write the server's self-signed cert to a PEM file to use as the CA.
	caPath := filepath.Join(t.TempDir(), "ca.pem")
	certDER := srv.Certificate().Raw
	pemBytes := pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: certDER})
	if err := os.WriteFile(caPath, pemBytes, 0o600); err != nil {
		t.Fatal(err)
	}
	// Sanity: the cert really is not in the system pool.
	if _, err := x509.SystemCertPool(); err != nil {
		t.Skip("no system cert pool on this platform")
	}

	cfg := Config{Issuer: srv.URL, ClientID: "kestrel"}

	// Without the CA file, discovery over the self-signed TLS must fail.
	if _, err := NewAuthenticator(context.Background(), cfg, []byte("0123456789abcdef0123456789abcdef")); err == nil {
		t.Fatal("expected discovery to fail without CAFile (untrusted self-signed cert)")
	}

	// With the CA file, discovery must succeed.
	cfg.CAFile = caPath
	a, err := NewAuthenticator(context.Background(), cfg, []byte("0123456789abcdef0123456789abcdef"))
	if err != nil {
		t.Fatalf("expected success with CAFile, got %v", err)
	}
	a.Close()

	// A missing CA file is a clear error.
	cfg.CAFile = filepath.Join(t.TempDir(), "nope.pem")
	if _, err := NewAuthenticator(context.Background(), cfg, []byte("0123456789abcdef0123456789abcdef")); err == nil {
		t.Fatal("expected error for missing CA file")
	}
}
