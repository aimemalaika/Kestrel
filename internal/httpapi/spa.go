package httpapi

import (
	"io/fs"
	"net/http"
	"path"
	"strings"
)

const fallbackHTML = `<!doctype html><meta charset="utf-8"><title>Kestrel</title>
<p>Kestrel API is running. The web UI has not been built into this binary
(run <code>npm run build</code> in web/ and rebuild).</p>`

// SPA serves static files from dist, falling back to index.html for unknown
// paths (client-side routing). If dist has no index.html (not built), a small
// built-in page is served instead so the binary still works.
func SPA(dist fs.FS) http.Handler {
	files := http.FileServerFS(dist)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		p := strings.TrimPrefix(path.Clean("/"+r.URL.Path), "/")
		if p != "" {
			if st, err := fs.Stat(dist, p); err == nil && !st.IsDir() {
				files.ServeHTTP(w, r)
				return
			}
		}
		idx, err := fs.ReadFile(dist, "index.html")
		if err != nil {
			idx = []byte(fallbackHTML)
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write(idx)
	})
}
