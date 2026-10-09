import { del, getJSON, q } from '../moduleFetch'
import type { ImageInfo, RegistryClient } from './RegistryClient'

interface RegistryConfig {
  deletesEnabled: boolean
}

export function createHttpRegistry(): RegistryClient {
  const client: RegistryClient = {
    // The interface exposes deletesEnabled as a sync boolean (read directly in
    // ImageDetail). Default to false and best-effort update once /config loads.
    deletesEnabled: false,
    async listRepos() {
      const { repos } = await getJSON<{ repos: string[] }>('/api/registry/repos')
      return repos
    },
    async listTags(repo) {
      const { tags } = await getJSON<{ tags: string[] }>(`/api/registry/tags?repo=${q(repo)}`)
      return tags
    },
    async getImage(repo, tag) {
      return getJSON<ImageInfo>(`/api/registry/image?repo=${q(repo)}&tag=${q(tag)}`)
    },
    async deleteByDigest(repo, digest) {
      await del(`/api/registry/image?repo=${q(repo)}&digest=${q(digest)}`)
    },
  }

  // Fire-and-forget: learn whether deletes are enabled. Ignore failures
  // (e.g. 503 when the registry is unconfigured) — deletes simply stay hidden.
  getJSON<RegistryConfig>('/api/registry/config')
    .then((cfg) => {
      client.deletesEnabled = cfg.deletesEnabled
    })
    .catch(() => {
      /* leave deletesEnabled false */
    })

  return client
}
