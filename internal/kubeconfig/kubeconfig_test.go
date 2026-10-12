package kubeconfig

import (
	"crypto/tls"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/aimemalaika/Kestrel/internal/auth"
)

func cfg() Config {
	return Config{
		Issuer:      "https://broker.example.com",
		ClientID:    "kestrel",
		APIServer:   "https://api.brd-hq-cluster.brd.rw:8443",
		CAData:      []byte("ca-pem"),
		ClusterName: "brd-hq-cluster",
	}
}

// req builds a request to path with an authenticated identity and TLS on.
func req(path string) *http.Request {
	r := httptest.NewRequest(http.MethodGet, path, nil)
	r.TLS = &tls.ConnectionState{}
	return r.WithContext(auth.WithIdentity(r.Context(), auth.Identity{User: "alice@corp.com", Token: "id-tok"}))
}

func TestKubeconfigDownload_A1(t *testing.T) {
	rec := httptest.NewRecorder()
	Handler(cfg()).ServeHTTP(rec, req("/api/kubeconfig"))
	if rec.Code != http.StatusOK {
		t.Fatalf("code=%d body=%s", rec.Code, rec.Body)
	}
	if cd := rec.Header().Get("Content-Disposition"); !strings.Contains(cd, "attachment") {
		t.Errorf("expected attachment disposition, got %q", cd)
	}
	body := rec.Body.String()
	for _, want := range []string{"exec:", "oidc-login", "--oidc-issuer-url=https://broker.example.com", "--oidc-client-id=kestrel", "server: https://api.brd-hq-cluster.brd.rw:8443"} {
		if !strings.Contains(body, want) {
			t.Errorf("kubeconfig missing %q\n%s", want, body)
		}
	}
	if strings.Contains(body, "id-tok") {
		t.Error("A1 kubeconfig must NOT contain a bearer token")
	}
}

func TestLoginCommand_A2(t *testing.T) {
	rec := httptest.NewRecorder()
	Handler(cfg()).ServeHTTP(rec, req("/api/kubeconfig/command"))
	if rec.Code != http.StatusOK {
		t.Fatalf("code=%d body=%s", rec.Code, rec.Body)
	}
	if cc := rec.Header().Get("Cache-Control"); !strings.Contains(cc, "no-store") {
		t.Errorf("A2 must be no-store, got %q", cc)
	}
	var out struct {
		Command string `json:"command"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if !strings.Contains(out.Command, "id-tok") {
		t.Errorf("A2 command must embed the caller's own token: %q", out.Command)
	}
	if !strings.Contains(out.Command, "alice@corp.com") {
		t.Errorf("A2 command should reference the caller identity: %q", out.Command)
	}
}

func TestKubeconfig_Unauthenticated401(t *testing.T) {
	r := httptest.NewRequest(http.MethodGet, "/api/kubeconfig", nil)
	r.TLS = &tls.ConnectionState{} // https ok, but no identity on ctx
	rec := httptest.NewRecorder()
	Handler(cfg()).ServeHTTP(rec, r)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("code=%d want 401", rec.Code)
	}
}

func TestKubeconfig_PlainHTTPRefused(t *testing.T) {
	r := httptest.NewRequest(http.MethodGet, "/api/kubeconfig", nil) // r.TLS == nil
	r = r.WithContext(auth.WithIdentity(r.Context(), auth.Identity{User: "alice", Token: "id-tok"}))
	rec := httptest.NewRecorder()
	Handler(cfg()).ServeHTTP(rec, r)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("code=%d want 400 (https required)", rec.Code)
	}
}

func TestKubeconfig_NonGET405(t *testing.T) {
	r := httptest.NewRequest(http.MethodPost, "/api/kubeconfig", nil)
	r.TLS = &tls.ConnectionState{}
	r = r.WithContext(auth.WithIdentity(r.Context(), auth.Identity{User: "alice", Token: "t"}))
	rec := httptest.NewRecorder()
	Handler(cfg()).ServeHTTP(rec, r)
	if rec.Code != http.StatusMethodNotAllowed {
		t.Fatalf("code=%d want 405", rec.Code)
	}
}
