package httpapi

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/aimemalaika/Kestrel/internal/k8s"
	"k8s.io/apimachinery/pkg/version"
	fakediscovery "k8s.io/client-go/discovery/fake"
	kubefake "k8s.io/client-go/kubernetes/fake"
	"k8s.io/client-go/rest"
)

func fakeAccessorWithVersion(t *testing.T, v string) k8s.ClusterAccessor {
	t.Helper()
	cs := kubefake.NewSimpleClientset()
	fd := cs.Discovery().(*fakediscovery.FakeDiscovery)
	fd.FakedServerVersion = &version.Info{GitVersion: v}
	return k8s.NewAccessorFromAll(nil, fd, cs)
}

func TestClusterInfo(t *testing.T) {
	// A real accessor built from a bare config constructs its clients lazily, so
	// RESTConfig().Host is set while ServerVersion() fails (no server) — exercising
	// both the APIServerURL path and the version-error tolerance.
	withHost, err := k8s.NewAccessor(&rest.Config{Host: "https://api.brd-hq-cluster.brd.rw:8443"})
	if err != nil {
		t.Fatalf("NewAccessor: %v", err)
	}

	cases := []struct {
		name        string
		deps        Deps
		method      string
		wantStatus  int
		wantName    string
		wantVersion string
		wantURL     string
	}{
		{
			name:        "real cluster reports name and version",
			deps:        Deps{ClusterName: "brd-hq-cluster", Accessor: fakeAccessorWithVersion(t, "v1.33.4")},
			method:      http.MethodGet,
			wantStatus:  200,
			wantName:    "brd-hq-cluster",
			wantVersion: "v1.33.4",
			wantURL:     "",
		},
		{
			name:       "accessor with host reports apiServerURL, tolerates version error",
			deps:       Deps{ClusterName: "brd-hq-cluster", Accessor: withHost},
			method:     http.MethodGet,
			wantStatus: 200,
			wantName:   "brd-hq-cluster",
			wantURL:    "https://api.brd-hq-cluster.brd.rw:8443",
		},
		{
			name:       "mock (nil accessor) never 500s",
			deps:       Deps{},
			method:     http.MethodGet,
			wantStatus: 200,
		},
		{
			name:       "non-GET is 405",
			deps:       Deps{},
			method:     http.MethodPost,
			wantStatus: 405,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			a := newAPI(tc.deps)
			req := httptest.NewRequest(tc.method, "/api/cluster-info", nil)
			rec := httptest.NewRecorder()
			a.route(rec, req)
			if rec.Code != tc.wantStatus {
				t.Fatalf("status = %d want %d (body %s)", rec.Code, tc.wantStatus, rec.Body.String())
			}
			if tc.wantStatus != 200 {
				return
			}
			var info ClusterInfo
			if err := json.Unmarshal(rec.Body.Bytes(), &info); err != nil {
				t.Fatalf("decode: %v (body %s)", err, rec.Body.String())
			}
			if info.ClusterName != tc.wantName {
				t.Errorf("clusterName = %q want %q", info.ClusterName, tc.wantName)
			}
			if tc.wantVersion != "" && info.ServerVersion != tc.wantVersion {
				t.Errorf("serverVersion = %q want %q", info.ServerVersion, tc.wantVersion)
			}
			if info.APIServerURL != tc.wantURL {
				t.Errorf("apiServerURL = %q want %q", info.APIServerURL, tc.wantURL)
			}
		})
	}
}
