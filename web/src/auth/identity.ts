// The signed-in identity, as reported by the backend's /authinfo (never a
// client-side mock). A small module store lets non-React consumers (useCanI,
// the mock client's canI) observe identity changes; AuthProvider owns the
// authoritative state and writes it here when /authinfo resolves.
export type Identity = {
  name: string
  groups?: string[]
}

let current: Identity | null = null
const subscribers = new Set<() => void>()

export function getIdentity(): Identity | null {
  return current
}

export function setIdentity(id: Identity | null): void {
  current = id
  subscribers.forEach((cb) => cb())
}

export function subscribe(cb: () => void): () => void {
  subscribers.add(cb)
  return () => {
    subscribers.delete(cb)
  }
}
