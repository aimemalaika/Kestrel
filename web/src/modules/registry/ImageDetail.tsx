import { useEffect, useState } from 'react'
import { ConfirmDialog } from '../../write/ConfirmDialog'
import { useToast } from '../../toast/ToastProvider'
import { Card } from '../../ui'
import type { ImageInfo, RegistryClient } from './RegistryClient'

export const GC_NOTE =
  'Delete unlinks the tag; registry GC has not run, so disk space is not reclaimed.'

export function ImageDetail({
  client,
  repo,
  tag,
  onDeleted,
}: {
  client: RegistryClient
  repo: string
  tag: string
  onDeleted: () => void
}) {
  const toast = useToast()
  const [image, setImage] = useState<ImageInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    let active = true
    client
      .getImage(repo, tag)
      .then((i) => active && setImage(i))
      .catch((e: unknown) => active && setError(e instanceof Error ? e.message : String(e)))
    return () => {
      active = false
    }
  }, [client, repo, tag])

  if (error) return <p className="text-sm text-red-400">{error}</p>
  if (!image) return <p className="text-sm text-zinc-500">Loading…</p>

  const doDelete = async () => {
    setConfirming(false)
    try {
      await client.deleteByDigest(repo, image.digest)
      toast('ok', `Deleted ${repo}@${image.digest}`)
      onDeleted()
    } catch (e) {
      toast('error', e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-xs m-0">
          <dt className="text-zinc-500">Digest</dt>
          <dd className="m-0 font-mono text-sky-400 break-all">{image.digest}</dd>
          <dt className="text-zinc-500">Size</dt>
          <dd className="m-0 text-zinc-300">{(image.size / 1_000_000).toFixed(1)} MB</dd>
          <dt className="text-zinc-500">Layers</dt>
          <dd className="m-0 text-zinc-300">{image.layers}</dd>
        </dl>
      </Card>
      {client.deletesEnabled && (
        <div>
          <p className="text-xs text-zinc-500">{GC_NOTE}</p>
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="text-xs px-3 py-1.5 rounded-md border border-red-500/40 bg-red-500/10 text-red-400 hover:bg-red-500/20 cursor-pointer transition-colors"
          >
            Delete
          </button>
        </div>
      )}
      {confirming && (
        <ConfirmDialog
          message={`Delete ${image.digest} from ${repo}? ${GC_NOTE}`}
          confirmLabel="Delete"
          onConfirm={doDelete}
          onCancel={() => setConfirming(false)}
        />
      )}
    </div>
  )
}
