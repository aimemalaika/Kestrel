import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'

export interface Toast {
  id: number
  kind: 'ok' | 'error'
  message: string
}
const Ctx = createContext<(kind: 'ok' | 'error', message: string) => void>(() => {})
let nextId = 1

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const timers = useRef<number[]>([])
  useEffect(
    () => () => {
      timers.current.forEach((t) => clearTimeout(t))
    },
    [],
  )
  const toast = useCallback((kind: 'ok' | 'error', message: string) => {
    const id = nextId++
    setToasts((prev) => [...prev, { id, kind, message }])
    timers.current.push(
      window.setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000),
    )
  }, [])
  return (
    <Ctx.Provider value={toast}>
      {children}
      <div
        style={{
          position: 'fixed',
          top: 'var(--space-4)',
          right: 'var(--space-4)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-2)',
          zIndex: 30,
        }}
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            style={{
              padding: 'var(--space-3) var(--space-4)',
              borderRadius: 'var(--r-badge)',
              background: t.kind === 'ok' ? 'var(--ok-bg)' : 'var(--risk-bg)',
              color: t.kind === 'ok' ? 'var(--ok-fg)' : 'var(--risk-fg)',
              boxShadow: 'var(--shadow-card)',
            }}
          >
            {t.message}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  )
}

export function useToast() {
  return useContext(Ctx)
}
