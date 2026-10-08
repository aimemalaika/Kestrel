import { useEffect, useMemo, useState } from 'react'
import { createRegistryClient, type RegistryClient } from './RegistryClient'
import { ViewHeader } from '../../ui'
import { RepoList } from './RepoList'
import { TagList } from './TagList'
import { ImageDetail } from './ImageDetail'

const crumb = 'bg-transparent border-0 p-0 text-xs text-brand-fg cursor-pointer hover:underline'

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
    <section className="p-6 text-zinc-200">
      <ViewHeader title="Registry" count={repos.length} />
      <nav aria-label="Registry path" className="mb-4 text-xs text-zinc-500">
        <button
          type="button"
          className={crumb}
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
            <button type="button" className={crumb} onClick={() => setTag(null)}>
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
