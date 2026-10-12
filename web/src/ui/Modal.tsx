import { useEffect, useId, useRef } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'

export interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children: ReactNode
  footer?: ReactNode
}

// Modal is the app's reusable dialog. a11y mirrors ConfirmDialog: role=dialog,
// aria-modal, labelled by the title, Escape to close, focus the panel on open and
// restore focus to the opener on unmount. Backdrop click closes; panel click does not.
export function Modal({ open, onClose, title, description, children, footer }: ModalProps) {
  const titleId = useId()
  const descId = useId()
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const opener = document.activeElement as HTMLElement | null
    panelRef.current?.focus()
    return () => opener?.focus?.()
  }, [open])

  if (!open) return null

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      onClose()
    }
  }

  return (
    <div
      data-testid="modal-backdrop"
      onClick={onClose}
      onKeyDown={onKeyDown}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg bg-surface border border-zinc-700 rounded-lg shadow-2xl outline-none"
      >
        <div className="px-5 py-4 border-b border-zinc-800">
          <h2 id={titleId} className="m-0 text-sm font-semibold text-zinc-100">
            {title}
          </h2>
          {description && (
            <p id={descId} className="mt-1 mb-0 text-xs text-zinc-500">
              {description}
            </p>
          )}
        </div>
        <div className="px-5 py-4 text-sm text-zinc-300">{children}</div>
        {footer && (
          <div className="flex gap-3 justify-end px-5 py-3 border-t border-zinc-800">{footer}</div>
        )}
      </div>
    </div>
  )
}
