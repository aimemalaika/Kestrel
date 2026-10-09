// Command kestrel is the single binary: /api/* plus the embedded SPA.
package main

import (
	"flag"
	"io/fs"
	"log"
	"net/http"

	"github.com/aimemalaika/Kestrel/internal/httpapi"
	"github.com/aimemalaika/Kestrel/web"
)

func main() {
	addr := flag.String("addr", ":8080", "listen address")
	flag.Parse()

	dist, err := fs.Sub(web.Dist, "dist")
	if err != nil {
		log.Fatal(err)
	}
	mux := http.NewServeMux()
	mux.Handle("/api/", httpapi.New(httpapi.DefaultDeps()))
	mux.Handle("/", httpapi.SPA(dist))

	log.Printf("kestrel listening on %s", *addr)
	log.Fatal(http.ListenAndServe(*addr, mux))
}
