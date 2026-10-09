import { createMockRegistry } from './registryMock'
import { createHttpRegistry } from './httpRegistry'

export interface ImageInfo {
  digest: string
  size: number
  layers: number
}

export interface RegistryClient {
  deletesEnabled: boolean
  listRepos(): Promise<string[]>
  listTags(repo: string): Promise<string[]>
  getImage(repo: string, tag: string): Promise<ImageInfo>
  deleteByDigest(repo: string, digest: string): Promise<void>
}

let shared: RegistryClient | undefined

export function createRegistryClient(): RegistryClient {
  const impl = (import.meta.env.VITE_REGISTRY as string | undefined) ?? 'http'
  if (impl !== 'mock' && impl !== 'http') throw new Error(`Unknown registry client: ${impl}`)
  shared ??= impl === 'mock' ? createMockRegistry() : createHttpRegistry()
  return shared
}
