import { useEffect, useMemo, useState } from 'react'
import { createRegistryClient, type RegistryClient } from './RegistryClient'
import { RepoList } from './RepoList'
import { TagList } from './TagList'
import { ImageDetail } from './ImageDetail'

const crumb = {
  background: 'none',
  border: 'none',
  color: 'var(--brand-600)',
  cursor: 'pointer',
  padding: 0,
} as const

export function RegistryBrowser({ client: injected }: { client?: RegistryClient }) {
  const client = useMemo(() => injected ?? createRegistryClient(), [injected])
  const [repos, setRepos] = useState<string[]>([])
  const [tags, setTags] = useState<string[]>([])
  const [repo, setRepo] = useState<string | null>(null)
  const [tag, setTag] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    client.listRepos().then((r) => active && setRepos(r))
    return () => {
      active = false
    }
  }, [client])

  useEffect(() => {
    if (!repo) return
    let active = true
    client.listTags(repo).then((t) => active && setTags(t))
    return () => {
      active = false
    }
  }, [client, repo])

  const refresh = () => {
    setTag(null)
    client.listRepos().then(setRepos)
    if (repo) client.listTags(repo).then(setTags)
  }

  return (
    <section style={{ padding: 'var(--space-4)', color: 'var(--text)' }}>
      <h1 style={{ marginTop: 0 }}>Registry</h1>
      <nav aria-label="Registry path" style={{ marginBottom: 'var(--space-4)' }}>
        <button
          type="button"
          style={crumb}
          onClick={() => {
            setRepo(null)
            setTag(null)
          }}
        >
          Repositories
        </button>
        {repo && (
          <>
            {' / '}
            <button type="button" style={crumb} onClick={() => setTag(null)}>
              {repo}
            </button>
          </>
        )}
        {tag && <> / {tag}</>}
      </nav>
      {!repo && <RepoList repos={repos} onSelect={setRepo} />}
      {repo && !tag && <TagList tags={tags} onSelect={setTag} />}
      {repo && tag && <ImageDetail client={client} repo={repo} tag={tag} onDeleted={refresh} />}
    </section>
  )
}
