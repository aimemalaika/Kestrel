import { useEffect, useMemo, useState } from 'react'
import { createRegistryClient, type RegistryClient, type TagHistory } from './RegistryClient'
import { ViewHeader, EmptyState } from '../../ui'
import { RepoList, summarizeRepo, type RepoSummary } from './RepoList'
import { TagList } from './TagList'
import { ImageDetail } from './ImageDetail'
import type { ApiError, K8sObject } from '../../contract/types'
import { useResourceStream } from '../../table/useResourceStream'

const DEPLOYMENTS = { group: 'apps', version: 'v1', resource: 'deployments' }
const STATEFULSETS = { group: 'apps', version: 'v1', resource: 'statefulsets' }

/** Container images (`repo:tag`) of the given workloads. */
export function workloadImages(objs: K8sObject[]): Set<string> {
  const out = new Set<string>()
  for (const o of objs) {
    const spec = (o as { spec?: { template?: { spec?: { containers?: { image?: string }[] } } } })
      .spec
    for (const c of spec?.template?.spec?.containers ?? []) if (c.image) out.add(c.image)
  }
  return out
}

async function loadSummaries(client: RegistryClient): Promise<RepoSummary[]> {
  const rows = await client.getRepoSummaries()
  return rows.map((row) =>
    summarizeRepo(
      row.repo,
      row.tags,
      row.digest ? { digest: row.digest, created: row.created } : undefined,
    ),
  )
}

const crumb = 'bg-transparent border-0 p-0 text-xs text-brand-fg cursor-pointer hover:underline'

export function RegistryBrowser({
  client: injected,
  workloads,
}: {
  client?: RegistryClient
  /** Workloads to correlate against; defaults to streamed Deployments + StatefulSets. */
  workloads?: K8sObject[]
}) {
  const deps = useResourceStream(DEPLOYMENTS, undefined).rows
  const stss = useResourceStream(STATEFULSETS, undefined).rows
  const images = useMemo(
    () => workloadImages(workloads ?? [...deps, ...stss]),
    [workloads, deps, stss],
  )
  const client = useMemo(() => injected ?? createRegistryClient(), [injected])
  const [repos, setRepos] = useState<RepoSummary[]>([])
  const [history, setHistory] = useState<TagHistory[]>([])
  const [repo, setRepo] = useState<string | null>(null)
  const [tag, setTag] = useState<string | null>(null)
  const [error, setError] = useState<ApiError | null>(null)

  useEffect(() => {
    let active = true
    loadSummaries(client)
      .then((r) => {
        if (!active) return
        setError(null)
        setRepos(r)
      })
      .catch((e) => active && setError(e as ApiError))
    return () => {
      active = false
    }
  }, [client])

  useEffect(() => {
    if (!repo) return
    let active = true
    client
      .getHistory(repo)
      .then((t) => active && setHistory(t))
      .catch((e) => active && setError(e as ApiError))
    return () => {
      active = false
    }
  }, [client, repo])

  const refresh = () => {
    setTag(null)
    loadSummaries(client)
      .then((r) => {
        setError(null)
        setRepos(r)
      })
      .catch((e) => setError(e as ApiError))
    if (repo)
      client
        .getHistory(repo)
        .then(setHistory)
        .catch((e) => setError(e as ApiError))
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
      {error ? (
        error.code === 503 ? (
          <EmptyState
            icon="image"
            title="Registry not configured"
            hint="Set --registry-url to enable the image registry."
          />
        ) : (
          <EmptyState
            icon="image"
            title="Could not reach the registry"
            hint="Check the registry URL and that the backend can reach it."
          />
        )
      ) : (
        <>
          {!repo && <RepoList repos={repos} onSelect={setRepo} />}
          {repo && !tag && (
            <TagList
              history={history}
              deployed={
                new Set(history.filter((h) => images.has(`${repo}:${h.tag}`)).map((h) => h.tag))
              }
              onSelect={setTag}
            />
          )}
          {repo && tag && <ImageDetail client={client} repo={repo} tag={tag} onDeleted={refresh} />}
        </>
      )}
    </section>
  )
}
