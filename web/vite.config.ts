import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Origin the dev server proxies /api to. Override with KESTREL_BACKEND when the
// Go backend runs elsewhere (e.g. KESTREL_BACKEND=http://localhost:9000).
const backend = process.env.KESTREL_BACKEND ?? 'http://localhost:8080'

export default defineConfig({
  plugins: [react(), tailwindcss()],
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
