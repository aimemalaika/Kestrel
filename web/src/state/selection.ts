import { useMatch } from 'react-router-dom'
import type { GVR } from '../contract/types'

export interface Selection {
  namespace?: string
  gvr?: GVR
}

export function useSelection(): Selection {
  const full = useMatch('/ns/:namespace/:group/:version/:resource')
  const nsOnly = useMatch('/ns/:namespace')
  const p: Partial<Record<string, string>> = full?.params ?? nsOnly?.params ?? {}
  const gvr =
    full && p.group && p.version && p.resource
      ? { group: p.group, version: p.version, resource: p.resource }
      : undefined
  return { namespace: p.namespace, gvr }
}
