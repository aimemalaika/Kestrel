// Command kestrel is the single binary: /api/* plus the embedded SPA.
package main

import (
	"flag"
	"io/fs"
	"log"
	"net/http"
	"strings"

	"github.com/aimemalaika/Kestrel/internal/audit"
	"github.com/aimemalaika/Kestrel/internal/httpapi"
	"github.com/aimemalaika/Kestrel/internal/k8s"
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
	flag.Parse()

	protected := resource.ProtectedSet(strings.Split(*protectedNS, ","))
	auditor := audit.NewStdoutAuditor(nil) // one JSON line per mutation to stdout

	dist, err := fs.Sub(web.Dist, "dist")
	if err != nil {
		log.Fatal(err)
	}
	deps := httpapi.DefaultDeps()
	if !*mock {
		cfg, err := k8s.LoadConfig(*kubeconfig)
		if err != nil {
			// Fail fast: a silently broken cluster connection is worse than no start.
			log.Fatalf("cannot connect to a cluster: %v (use --mock for stub data, or --kubeconfig)", err)
		}
		acc, err := k8s.NewAccessor(cfg)
		if err != nil {
			log.Fatalf("cluster clients: %v", err)
		}
		deps.Resources = resource.NewServiceWith(k8s.NewReal(acc), protected, auditor)
		hub := stream.NewHubFromAccessor(acc)
		defer hub.Close()
		deps.Stream = hub
		deps.Logs = k8s.NewRealLogs(acc)
		deps.Exec = k8s.NewRealExec(acc)
		deps.PortForward = k8s.NewRealPortForward(acc)
		log.Printf("connected to cluster %s", cfg.Host)
	} else {
		deps.Resources = resource.NewServiceWith(k8s.Stub{}, protected, auditor)
		log.Printf("running with --mock stub data")
	}
	mux := http.NewServeMux()
	mux.Handle("/api/", httpapi.New(deps))
	mux.Handle("/", httpapi.SPA(dist))

	log.Printf("kestrel listening on %s", *addr)
	log.Fatal(http.ListenAndServe(*addr, mux))
}
