export type GVR = { group: string; version: string; resource: string }

export interface CatalogEntry {
  group: string
  version: string
  resource: string
  kind: string
  namespaced: boolean
  verbs: string[]
}
export interface OwnerRef {
  apiVersion: string
  kind: string
  name: string
  uid: string
}
export interface ObjectMeta {
  name: string
  namespace?: string
  uid?: string
  resourceVersion?: string
  creationTimestamp?: string
  labels?: Record<string, string>
  annotations?: Record<string, string>
  ownerReferences?: OwnerRef[]
}
export interface K8sObject {
  apiVersion: string
  kind: string
  metadata: ObjectMeta
  spec?: Record<string, unknown>
  status?: Record<string, unknown>
  [k: string]: unknown
}
export type WatchEnvelope =
  | { type: 'added' | 'modified' | 'deleted'; object: K8sObject }
  | { type: 'bookmark'; resourceVersion: string }
  | { type: 'error'; message: string }

export interface CanIRequest {
  verb: string
  group: string
  version: string
  resource: string
  namespace?: string
  name?: string
}
export interface CanIResponse {
  allowed: boolean
}
export interface ApiError {
  error: string
  code: number
  reason: string
}

export function isDeltaEnvelope(
  e: WatchEnvelope,
): e is Extract<WatchEnvelope, { object: K8sObject }> {
  return e.type === 'added' || e.type === 'modified' || e.type === 'deleted'
}
