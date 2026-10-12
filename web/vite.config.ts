import { defineConfig, type Plugin } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Origin the dev server proxies /api to. Override with KESTREL_BACKEND when the
// Go backend runs elsewhere (e.g. KESTREL_BACKEND=http://localhost:9000).
const backend = process.env.KESTREL_BACKEND ?? 'http://localhost:8080'

// Vite empties the outDir on build, which deletes the tracked `web/dist/.gitkeep`
// placeholder. `//go:embed all:dist` in web/embed.go needs dist/ to exist with a
// file, and the backend CI job builds Go WITHOUT building the SPA — so the
// committed placeholder must survive. Recreate it after every build.
function keepDistPlaceholder(): Plugin {
  return {
    name: 'keep-dist-placeholder',
    closeBundle() {
      try {
        writeFileSync(resolve(__dirname, 'dist/.gitkeep'), '')
      } catch {
        // best-effort; never fail the build over the placeholder
      }
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), keepDistPlaceholder()],
  // Proxy the API — including SSE streams and exec/port-forward WebSockets — to
  // the Go backend, so `npm run dev:live` serves the SPA with HMR while talking
  // to a real cluster. Harmless for `npm run dev` (mock client, never hits /api).
  server: {
    proxy: {
      '/api': { target: backend, changeOrigin: true, ws: true },
    },
  },
  test: { environment: 'jsdom', globals: true, setupFiles: ['./src/setupTests.ts'] },
})
