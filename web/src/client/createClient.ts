import type { Client } from './Client'
import { createMockClient } from './MockClient'
import { createHttpClient } from './HttpClient'

export function createClient(): Client {
  // Default to the real HTTP client so a production build (and the Docker/Helm
  // image) talks to the backend. The Vite dev server and the test runner pin
  // VITE_CLIENT=mock via .env.development / .env.test so UI work needs no
  // backend; set VITE_CLIENT=mock explicitly to preview mock data from a build.
  const impl = (import.meta.env.VITE_CLIENT as string | undefined) ?? 'http'
  switch (impl) {
    case 'mock':
      return createMockClient()
    case 'http':
      return createHttpClient()
    default:
      throw new Error(`unknown VITE_CLIENT: ${impl}`)
  }
}
