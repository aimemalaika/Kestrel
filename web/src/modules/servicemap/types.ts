export interface ServiceDep {
  id: string
  protocol?: string
  critical: boolean
}

export interface ServiceNodeModel {
  id: string
  displayName: string
  slo: number
  workload?: {
    namespace: string
    kind?: string
    name?: string
    selector?: Record<string, string>
  }
  dependsOn: ServiceDep[]
}

export interface ServiceMapModel {
  name: string
  services: ServiceNodeModel[]
}

export interface ValidationError {
  message: string
  serviceId?: string
  edge?: [string, string]
}

export type ParseResult =
  { ok: true; model: ServiceMapModel } | { ok: false; errors: ValidationError[] }
