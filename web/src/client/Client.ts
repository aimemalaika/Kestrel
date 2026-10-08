import type {
  CatalogEntry,
  GVR,
  K8sObject,
  WatchEnvelope,
  CanIRequest,
  CanIResponse,
} from '../contract/types'

export type Unsubscribe = () => void
export type ResourceRef = GVR & { namespace?: string; name: string }
export interface WatchOptions {
  namespace?: string
}

export interface Client {
  catalog(): Promise<CatalogEntry[]>
  get(ref: ResourceRef): Promise<K8sObject>
  apply(obj: K8sObject, opts?: { dryRun?: boolean }): Promise<K8sObject>
  delete(ref: ResourceRef, opts?: { dryRun?: boolean }): Promise<void>
  watch(gvr: GVR, opts: WatchOptions, onEvent: (e: WatchEnvelope) => void): Unsubscribe
  canI(req: CanIRequest): Promise<CanIResponse>
  logs(ref: ResourceRef, onLine: (line: string) => void): Unsubscribe
  exec(ref: ResourceRef): ExecSession
  portForward(ref: ResourceRef, localPort: number, remotePort: number): PortForwardSession
}

export interface ExecSession {
  onData(cb: (data: string) => void): void
  send(data: string): void
  resize(cols: number, rows: number): void
  close(): void
}

export interface PortForwardSession {
  id: string
  ref: ResourceRef
  localPort: number
  remotePort: number
  status: 'active' | 'closed'
  close(): void
}
