import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createClient } from '../client/createClient'
import type { ResourceRef } from '../client/Client'
import { useToast } from '../toast/ToastProvider'
import { ConfirmDialog } from './ConfirmDialog'

export function DeleteButton({ target, disabled }: { target: ResourceRef; disabled?: boolean }) {
  const [confirming, setConfirming] = useState(false)
  const toast = useToast()
  const navigate = useNavigate()

  const doDelete = async () => {
    setConfirming(false)
    try {
      await createClient().delete(target)
      toast('ok', `Deleted ${target.name}`)
      navigate('..')
    } catch (e) {
      const err = e as { error?: string }
      toast('error', err.error ?? 'Delete failed')
    }
  }

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setConfirming(true)}
        style={{
          padding: '4px var(--space-3)',
          borderRadius: 'var(--r-badge)',
          border: '1px solid var(--border)',
          background: 'var(--surface)',
          color: 'var(--risk-fg)',
          cursor: 'pointer',
        }}
      >
        Delete {target.name}
      </button>
      {confirming && (
        <ConfirmDialog
          message={`Delete ${target.name}? This cannot be undone.`}
          confirmLabel="Delete"
          onConfirm={doDelete}
          onCancel={() => setConfirming(false)}
        />
      )}
    </>
  )
}
