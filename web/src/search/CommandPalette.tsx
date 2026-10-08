import { useEffect, useMemo, useRef, useState } from 'react'
import { useMatch, useNavigate } from 'react-router-dom'
import { createClient } from '../client/createClient'
import type { CatalogEntry, GVR } from '../contract/types'
import { useResourceStream } from '../table/useResourceStream'

interface Item {
  id: string
  group: 'Kinds' | 'Resources'
  label: string
  hint: string
  path: string
}

function fuzzy(text: string, q: string): boolean {
  const t = text.toLowerCase()
  let i = 0
  for (const ch of q.toLowerCase()) {
    i = t.indexOf(ch, i)
    if (i < 0) return false
    i++
  }
  return true
}

const MAX = 50

export function CommandPalette() {
  const navigate = useNavigate()
  const match = useMatch('/ns/:namespace/:group/:version/:resource/*')
  const ns = match?.params.namespace
  const g = match?.params.group
  const v = match?.params.version
  const r = match?.params.resource
  const gvr: GVR | undefined = useMemo(
    () => (g && v && r ? { group: g, version: v, resource: r } : undefined),
    [g, v, r],
  )
  const { rows } = useResourceStream(gvr, ns)

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [catalog, setCatalog] = useState<CatalogEntry[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((o) => !o)
      } else if (e.key === 'Escape') {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (!open) return
    setQuery('')
    setActive(0)
    let live = true
    createClient()
      .catalog()
      .then((c) => live && setCatalog(c))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [open])

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  const items = useMemo<Item[]>(() => {
    if (!open) return []
    const nsPart = ns ?? 'default'
    const kinds: Item[] = catalog
      .filter((c) => !query || fuzzy(`${c.kind} ${c.resource}`, query))
      .map((c) => ({
        id: `k:${c.group}/${c.version}/${c.resource}`,
        group: 'Kinds' as const,
        label: c.kind,
        hint: c.resource,
        path: `/ns/${nsPart}/${c.group}/${c.version}/${c.resource}`,
      }))
    const objs: Item[] =
      gvr && query
        ? rows
            .filter((o) =>
              fuzzy(`${o.metadata.name} ${o.metadata.namespace ?? ''} ${o.kind}`, query),
            )
            .map((o) => ({
              id: `o:${o.metadata.uid ?? `${o.metadata.namespace}/${o.metadata.name}`}`,
              group: 'Resources' as const,
              label: o.metadata.name,
              hint: [o.kind, o.metadata.namespace].filter(Boolean).join(' · '),
              path: `/ns/${o.metadata.namespace ?? ns ?? 'default'}/${gvr.group}/${gvr.version}/${gvr.resource}/${encodeURIComponent(o.metadata.name)}`,
            }))
        : []
    return [...kinds, ...objs].slice(0, MAX)
  }, [open, catalog, query, rows, gvr, ns])

  if (!open) return null

  const choose = (it: Item | undefined) => {
    if (!it) return
    navigate(it.path)
    setOpen(false)
  }

  const onInputKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => Math.min(a + 1, items.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(a - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      choose(items[active])
    }
  }

  const groups = (['Kinds', 'Resources'] as const).map((g) => ({
    g,
    list: items.map((it, idx) => ({ it, idx })).filter((x) => x.it.group === g),
  }))

  return (
    <div
      onClick={() => setOpen(false)}
      className="fixed inset-0 z-[1000] flex justify-center items-start pt-[12vh] bg-black/60"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onClick={(e) => e.stopPropagation()}
        className="w-[min(560px,92vw)] bg-surface text-zinc-200 border border-zinc-800/80 rounded-lg shadow-2xl overflow-hidden"
      >
        <input
          ref={inputRef}
          aria-label="Search kinds and resources"
          placeholder="Search kinds and resources…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setActive(0)
          }}
          onKeyDown={onInputKey}
          className="w-full box-border px-4 py-3 bg-surface text-zinc-200 placeholder-zinc-600 border-0 border-b border-zinc-800/80 outline-none"
        />
        <div role="listbox" className="max-h-90 overflow-y-auto">
          {items.length === 0 && <div className="px-4 py-3 text-zinc-500">No results</div>}
          {groups.map(
            ({ g, list }) =>
              list.length > 0 && (
                <div key={g}>
                  <div className="px-4 py-1.5 text-[10px] uppercase tracking-widest text-zinc-500">
                    {g}
                  </div>
                  {list.map(({ it, idx }) => (
                    <div
                      key={it.id}
                      role="option"
                      aria-selected={idx === active}
                      onClick={() => choose(it)}
                      onMouseEnter={() => setActive(idx)}
                      className={`px-4 py-1.5 cursor-pointer flex justify-between ${
                        idx === active ? 'bg-brand/20 text-brand-fg' : 'text-zinc-300'
                      }`}
                    >
                      <span>{it.label}</span>
                      <span className="text-zinc-500">{it.hint}</span>
                    </div>
                  ))}
                </div>
              ),
          )}
        </div>
      </div>
    </div>
  )
}
