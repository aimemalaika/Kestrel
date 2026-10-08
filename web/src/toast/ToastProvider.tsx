import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { Icon } from '../ui'

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
      <div className="fixed top-4 right-4 z-30 flex flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`flex items-center gap-2 px-4 py-2.5 rounded-md text-xs font-medium border shadow-lg ${
              t.kind === 'ok'
                ? 'bg-emerald-950 border-emerald-800 text-emerald-300'
                : 'bg-red-950 border-red-900 text-red-300'
            }`}
          >
            <Icon name={t.kind === 'ok' ? 'check' : 'alert'} className="w-3.5 h-3.5 shrink-0" />
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
