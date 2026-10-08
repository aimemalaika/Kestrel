import { useEffect, useState } from 'react'
import { ConfirmDialog } from '../../write/ConfirmDialog'
import { useToast } from '../../toast/ToastProvider'
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

  if (error) return <p style={{ color: 'var(--risk-fg)' }}>{error}</p>
  if (!image) return <p style={{ color: 'var(--text-muted)' }}>Loading…</p>

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
    <div>
      <dl
        style={{
          display: 'grid',
          gridTemplateColumns: 'max-content 1fr',
          gap: 'var(--space-2) var(--space-4)',
        }}
      >
        <dt>Digest</dt>
        <dd style={{ margin: 0, fontFamily: 'monospace' }}>{image.digest}</dd>
        <dt>Size</dt>
        <dd style={{ margin: 0 }}>{(image.size / 1_000_000).toFixed(1)} MB</dd>
        <dt>Layers</dt>
        <dd style={{ margin: 0 }}>{image.layers}</dd>
      </dl>
      {client.deletesEnabled && (
        <div>
          <p style={{ color: 'var(--text-muted)' }}>{GC_NOTE}</p>
          <button
            type="button"
            onClick={() => setConfirming(true)}
            style={{
              padding: '6px var(--space-3)',
              borderRadius: 'var(--r-badge)',
              border: '1px solid var(--risk-fg)',
              background: 'var(--surface)',
              color: 'var(--risk-fg)',
              cursor: 'pointer',
            }}
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
