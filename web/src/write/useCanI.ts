import { useEffect, useState, useSyncExternalStore } from 'react'
import { getIdentity, subscribe } from '../auth/identity'
import { createClient } from '../client/createClient'
import type { CanIRequest } from '../contract/types'

export function useCanI(req: CanIRequest | undefined): boolean {
  const [allowed, setAllowed] = useState(true)
  // Re-evaluate whenever the signed-in identity changes.
  const identity = useSyncExternalStore(subscribe, getIdentity)
  useEffect(() => {
    if (!req) {
      setAllowed(true)
      return
    }
    let active = true
    createClient()
      .canI(req)
      .then((r) => {
        if (active) setAllowed(r.allowed)
      })
      .catch(() => {
        if (active) setAllowed(false)
      })
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps are req's primitive fields so a new req object identity doesn't refetch each render
  }, [req?.verb, req?.group, req?.version, req?.resource, req?.namespace, req?.name, identity])
  return allowed
}
