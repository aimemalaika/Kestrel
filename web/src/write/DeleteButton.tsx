import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createClient } from '../client/createClient'
import type { ResourceRef } from '../client/Client'
import { useToast } from '../toast/ToastProvider'
import { Icon } from '../ui'
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
        className="flex items-center gap-1.5 text-xs bg-zinc-800 hover:bg-red-950/60 text-red-400 border border-zinc-700 hover:border-red-900 px-3 py-1.5 rounded-md font-medium transition-colors disabled:opacity-50"
      >
        <Icon name="close" className="w-3.5 h-3.5" />
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
