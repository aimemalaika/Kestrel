export type Identity = {
  user: string
  groups: string[]
  serviceAccount?: string
  role: 'operator' | 'viewer'
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

export const IDENTITY_PRESETS: Identity[] = [
  {
    user: 'operator@kestrel',
    groups: ['system:masters'],
    serviceAccount: 'kestrel-operator',
    role: 'operator',
  },
  { user: 'viewer@kestrel', groups: ['viewers'], role: 'viewer' },
]
