import type { ImageInfo, RegistryClient } from './RegistryClient'

const SEED: Record<string, Record<string, ImageInfo>> = {
  'team/api': {
    latest: { digest: 'sha256:a1b2c3d4e5f60718293a4b5c6d7e8f90', size: 84_000_000, layers: 9 },
    'v1.4.0': { digest: 'sha256:a1b2c3d4e5f60718293a4b5c6d7e8f90', size: 84_000_000, layers: 9 },
    'v1.3.2': { digest: 'sha256:0f1e2d3c4b5a69788796a5b4c3d2e1f0', size: 81_500_000, layers: 9 },
  },
  'team/web': {
    latest: { digest: 'sha256:b7c8d9e0f1a2b3c4d5e6f708192a3b4c', size: 42_300_000, layers: 6 },
    'v2.0.1': { digest: 'sha256:b7c8d9e0f1a2b3c4d5e6f708192a3b4c', size: 42_300_000, layers: 6 },
  },
  'infra/tools': {
    '1.0': { digest: 'sha256:c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8', size: 120_000_000, layers: 12 },
  },
}

export function createMockRegistry(): RegistryClient {
  const data: Record<string, Record<string, ImageInfo>> = {}
  for (const [repo, tags] of Object.entries(SEED)) {
    data[repo] = Object.fromEntries(Object.entries(tags).map(([t, i]) => [t, { ...i }]))
  }
  return {
    deletesEnabled: true,
    async listRepos() {
      return Object.keys(data).filter((r) => Object.keys(data[r]).length > 0)
    },
    async listTags(repo) {
      return Object.keys(data[repo] ?? {})
    },
    async getImage(repo, tag) {
      const img = data[repo]?.[tag]
      if (!img) throw new Error(`image not found: ${repo}:${tag}`)
      return { ...img }
    },
    async deleteByDigest(repo, digest) {
      const tags = data[repo]
      if (!tags) return
      for (const t of Object.keys(tags)) if (tags[t].digest === digest) delete tags[t]
    },
  }
}
