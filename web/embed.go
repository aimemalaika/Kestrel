// Package web exposes the built SPA (web/dist) for embedding in the binary.
package web

import "embed"

// Dist holds web/dist. `all:` includes dotfiles so the committed
// dist/.gitkeep keeps the pattern valid before the SPA has been built.
//
//go:embed all:dist
var Dist embed.FS
