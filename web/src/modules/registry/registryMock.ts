import type { ImageInfo, RegistryClient, RepoSummaryWire, TagHistory } from './RegistryClient'

const SEED: Record<string, Record<string, ImageInfo>> = {
  'kestrel/api-gateway': {
    '2.4.1': {
      digest: 'sha256:d4e5f60718293a4b5c6d7e8f90a1b2c3',
      size: 96_000_000,
      layers: 10,
      created: '2026-10-01T10:00:00Z',
    },
    '2.4.0': {
      digest: 'sha256:e5f60718293a4b5c6d7e8f90a1b2c3d4',
      size: 95_200_000,
      layers: 10,
      created: '2026-09-20T10:00:00Z',
    },
    '2.3.9': {
      digest: 'sha256:f60718293a4b5c6d7e8f90a1b2c3d4e5',
      size: 94_800_000,
      layers: 10,
      created: '2026-09-02T10:00:00Z',
    },
  },
  'team/api': {
    latest: {
      digest: 'sha256:a1b2c3d4e5f60718293a4b5c6d7e8f90',
      size: 84_000_000,
      layers: 9,
      created: '2026-10-10T14:25:00Z',
    },
    'v1.4.0': {
      digest: 'sha256:a1b2c3d4e5f60718293a4b5c6d7e8f90',
      size: 84_000_000,
      layers: 9,
      created: '2026-10-10T14:20:00Z',
    },
    'v1.3.2': {
      digest: 'sha256:0f1e2d3c4b5a69788796a5b4c3d2e1f0',
      size: 81_500_000,
      layers: 9,
      created: '2026-09-18T09:05:00Z',
    },
  },
  'team/web': {
    latest: {
      digest: 'sha256:b7c8d9e0f1a2b3c4d5e6f708192a3b4c',
      size: 42_300_000,
      layers: 6,
      created: '2026-10-06T16:50:00Z',
    },
    'v2.0.1': {
      digest: 'sha256:b7c8d9e0f1a2b3c4d5e6f708192a3b4c',
      size: 42_300_000,
      layers: 6,
      created: '2026-10-06T16:45:00Z',
    },
  },
  'infra/tools': {
    '1.0': {
      digest: 'sha256:c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8',
      size: 120_000_000,
      layers: 12,
      created: '2026-08-02T11:30:00Z',
    },
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
    async getRepoSummaries() {
      const out: RepoSummaryWire[] = []
      for (const [repo, tags] of Object.entries(data)) {
        const names = Object.keys(tags)
        if (names.length === 0) continue
        const img = tags[names.includes('latest') ? 'latest' : names[0]]
        out.push({ repo, tags: names, digest: img.digest, created: img.created, size: img.size })
      }
      return out
    },
    async listTags(repo) {
      return Object.keys(data[repo] ?? {})
    },
    async getHistory(repo) {
      const out: TagHistory[] = Object.entries(data[repo] ?? {}).map(([tag, i]) => ({
        tag,
        digest: i.digest,
        created: i.created,
        size: i.size,
        layers: i.layers,
      }))
      return out.sort((a, b) => Date.parse(b.created ?? '') - Date.parse(a.created ?? ''))
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
