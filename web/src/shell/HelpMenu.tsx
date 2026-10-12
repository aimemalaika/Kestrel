import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Modal } from '../ui'

type Dialog = 'docs' | 'shortcuts' | 'about' | null

const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60'

// HelpMenu is the top-bar "?" control: a dropdown of Documentation / Keyboard
// shortcuts / API Explorer / About Kestrel. The first, second and fourth open a
// Modal; API Explorer navigates to the existing route.
export function HelpMenu() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [dialog, setDialog] = useState<Dialog>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const choose = (d: Exclude<Dialog, null> | 'api') => {
    setOpen(false)
    if (d === 'api') {
      navigate('/api-explorer')
      return
    }
    setDialog(d)
  }

  const item =
    'w-full text-left px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800 focus:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60 focus-visible:ring-inset'

  return (
    <div
      ref={ref}
      className="relative"
      onKeyDown={(e) => {
        if (e.key === 'Escape' && open) setOpen(false)
      }}
    >
      <button
        type="button"
        aria-label="Help"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`rounded-lg text-zinc-400 text-xs font-bold border border-zinc-700/50 w-7 h-7 flex items-center justify-center hover:bg-zinc-800 hover:text-zinc-200 transition-colors ${FOCUS}`}
      >
        ?
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1 w-48 bg-header border border-zinc-700 rounded-lg shadow-xl z-50 py-1"
        >
          <button type="button" role="menuitem" className={item} onClick={() => choose('docs')}>
            Documentation
          </button>
          <button
            type="button"
            role="menuitem"
            className={item}
            onClick={() => choose('shortcuts')}
          >
            Keyboard shortcuts
          </button>
          <button type="button" role="menuitem" className={item} onClick={() => choose('api')}>
            API Explorer
          </button>
          <button type="button" role="menuitem" className={item} onClick={() => choose('about')}>
            About Kestrel
          </button>
        </div>
      )}

      <Modal
        open={dialog === 'docs'}
        onClose={() => setDialog(null)}
        title="Kestrel documentation"
        description="A UI-first console for your Kubernetes cluster"
      >
        <p className="mt-0">
          Browse any resource from the catalog in the sidebar, inspect live detail and YAML, stream
          logs, and open a shell into a pod. Workloads, networking, storage, RBAC and cluster
          settings each have their own area.
        </p>
        <button
          type="button"
          onClick={() => {
            setDialog(null)
            navigate('/api-explorer')
          }}
          className={`mt-2 text-xs text-brand hover:underline ${FOCUS}`}
        >
          Open the API Explorer →
        </button>
      </Modal>

      <Modal
        open={dialog === 'shortcuts'}
        onClose={() => setDialog(null)}
        title="Keyboard shortcuts"
      >
        <dl className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-2 m-0">
          <dt className="text-zinc-400">Focus global search</dt>
          <dd className="m-0 font-mono text-zinc-200">⌘ K</dd>
          <dt className="text-zinc-400">Focus global search</dt>
          <dd className="m-0 font-mono text-zinc-200">/</dd>
          <dt className="text-zinc-400">Close dialog / drawer</dt>
          <dd className="m-0 font-mono text-zinc-200">Esc</dd>
        </dl>
      </Modal>

      <Modal open={dialog === 'about'} onClose={() => setDialog(null)} title="About Kestrel">
        <p className="mt-0 font-semibold text-zinc-100">Kestrel</p>
        <p className="mt-1 mb-0 text-zinc-400">
          A single-binary, UI-first console for Kubernetes — a live, read-first view of cluster
          resources with per-user, RBAC-respecting access.
        </p>
      </Modal>
    </div>
  )
}
