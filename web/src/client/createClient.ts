import type { Client } from './Client'
import { createMockClient } from './MockClient'

export function createClient(): Client {
  const impl = (import.meta.env.VITE_CLIENT as string | undefined) ?? 'mock'
  switch (impl) {
    case 'mock':
      return createMockClient()
    // case 'http': return createHttpClient()  // added in U8
    default:
      throw new Error(`unknown VITE_CLIENT: ${impl}`)
  }
}
