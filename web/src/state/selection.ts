import { useMatch } from 'react-router-dom'
import type { GVR } from '../contract/types'

export interface Selection {
  namespace?: string
  gvr?: GVR
}

export function useSelection(): Selection {
  // Resolve gvr whether or not a specific resource name is in the path, so the
  // current resource view is known on both list (…/pods) and detail (…/pods/web-1) pages.
  const detail = useMatch('/ns/:namespace/:group/:version/:resource/:name')
  const full = useMatch('/ns/:namespace/:group/:version/:resource')
  const nsOnly = useMatch('/ns/:namespace')
  const p: Partial<Record<string, string>> = detail?.params ?? full?.params ?? nsOnly?.params ?? {}
  const gvr =
    (detail || full) && p.group && p.version && p.resource
      ? { group: p.group, version: p.version, resource: p.resource }
      : undefined
  // `_all` is the All-Namespaces sentinel → no namespace scope (streams show every namespace).
  const namespace = p.namespace === '_all' ? undefined : p.namespace
  return { namespace, gvr }
}
