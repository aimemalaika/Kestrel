import { useEffect, useId, useRef } from 'react'
import type { KeyboardEvent } from 'react'

export function ConfirmDialog({
  message,
  confirmLabel = 'Confirm',
  onConfirm,
  onCancel,
}: {
  message: string
  confirmLabel?: string
  onConfirm: () => void
  onCancel: () => void
}) {
  const titleId = useId()
  const confirmRef = useRef<HTMLButtonElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    cancelRef.current?.focus()
    return () => opener?.focus?.()
  }, [])

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      onCancel()
      return
    }
    if (e.key === 'Tab') {
      const first = cancelRef.current
      const last = confirmRef.current
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last?.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first?.focus()
      }
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onKeyDown={onKeyDown}
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/60"
    >
      <div className="max-w-105 w-full mx-4 bg-surface border border-zinc-700 rounded-lg p-6 shadow-2xl">
        <p id={titleId} className="mt-0 mb-5 text-sm text-zinc-200">
          {message}
        </p>
        <div className="flex gap-3 justify-end">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 px-3 py-1.5 rounded-md font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-zinc-500"
          >
            Cancel
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            className="text-xs bg-brand hover:bg-red-600 text-white px-3.5 py-1.5 rounded-md font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-red-400"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
