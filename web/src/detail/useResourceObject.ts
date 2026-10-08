import type { GVR, K8sObject } from '../contract/types'
import { useResourceStream } from '../table/useResourceStream'

export type ObjectStatus = 'idle' | 'loading' | 'ready' | 'notfound' | 'error'

export function useResourceObject(
  gvr: GVR | undefined,
  namespace: string | undefined,
  name: string | undefined,
): { object: K8sObject | undefined; status: ObjectStatus } {
  const { rows, status } = useResourceStream(gvr, namespace)
  const object = name ? rows.find((o) => o.metadata.name === name) : undefined
  let objStatus: ObjectStatus
  if (!gvr || !name) objStatus = 'idle'
  else if (status === 'loading') objStatus = 'loading'
  else if (status === 'error') objStatus = 'error'
  else objStatus = object ? 'ready' : 'notfound'
  return { object, status: objStatus }
}
