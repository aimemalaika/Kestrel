import { useEffect, useState } from 'react'
import { createClient } from '../client/createClient'
import type { CanIRequest } from '../contract/types'

export function useCanI(req: CanIRequest | undefined): boolean {
  const [allowed, setAllowed] = useState(true)
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
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps are req's primitive fields so a new req object identity doesn't refetch each render
  }, [req?.verb, req?.group, req?.version, req?.resource, req?.namespace, req?.name])
  return allowed
}
