import { createMockRegistry } from './registryMock'
import { createHttpRegistry } from './httpRegistry'

export interface ImageInfo {
  digest: string
  size: number
  layers: number
  created?: string
}

export interface TagHistory {
  tag: string
  digest: string
  created?: string
  size: number
  layers: number
}

/** Per-repo latest-image summary as served by GET /api/registry/summary. */
export interface RepoSummaryWire {
  repo: string
  tags: string[]
  digest?: string
  created?: string
  size?: number
}

export interface RegistryClient {
  deletesEnabled: boolean
  listRepos(): Promise<string[]>
  getRepoSummaries(): Promise<RepoSummaryWire[]>
  listTags(repo: string): Promise<string[]>
  getHistory(repo: string): Promise<TagHistory[]>
  getImage(repo: string, tag: string): Promise<ImageInfo>
  deleteByDigest(repo: string, digest: string): Promise<void>
}

let shared: RegistryClient | undefined

export function createRegistryClient(): RegistryClient {
  // Follow the main client's mock/http choice (VITE_CLIENT) by default so
  // `make dev` shows mock registry data instead of a 503 "not configured";
  // VITE_REGISTRY overrides it if set. Production (neither set) → http.
  const impl =
    (import.meta.env.VITE_REGISTRY as string | undefined) ??
    (import.meta.env.VITE_CLIENT as string | undefined) ??
    'http'
  if (impl !== 'mock' && impl !== 'http') throw new Error(`Unknown registry client: ${impl}`)
  shared ??= impl === 'mock' ? createMockRegistry() : createHttpRegistry()
  return shared
}
