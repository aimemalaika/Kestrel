import type { Client } from './Client'
import { createMockClient } from './MockClient'
import { createHttpClient } from './HttpClient'

export function createClient(): Client {
  const impl = (import.meta.env.VITE_CLIENT as string | undefined) ?? 'mock'
  switch (impl) {
    case 'mock':
      return createMockClient()
    case 'http':
      return createHttpClient()
    default:
      throw new Error(`unknown VITE_CLIENT: ${impl}`)
  }
}
