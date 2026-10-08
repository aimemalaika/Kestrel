import { createMockRegistry } from './registryMock'

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
  const impl = (import.meta.env.VITE_REGISTRY as string | undefined) ?? 'mock'
  if (impl !== 'mock') throw new Error(`Unknown registry client: ${impl}`)
  shared ??= createMockRegistry()
  return shared
}
