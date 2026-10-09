import type { ServiceMapModel } from './types'

export interface SlaResult {
  id: string
  declared: number
  projected: number
  limitedBy?: string
  path: string[]
}

/** Series availability over critical deps; assumes a validated DAG. */
export function projectSla(model: ServiceMapModel): Map<string, SlaResult> {
  const byId = new Map(model.services.map((s) => [s.id, s]))
  const avail = new Map<string, number>()
  const out = new Map<string, SlaResult>()

  const compute = (id: string): number => {
    const cached = avail.get(id)
    if (cached !== undefined) return cached
    const svc = byId.get(id)!
    let a = svc.slo / 100
    let limitedBy: string | undefined
    let limitingA = 1
    let path: string[] = [id]
    for (const d of svc.dependsOn) {
      if (!d.critical || !byId.has(d.id)) continue
      const da = compute(d.id)
      a *= da
      if (da < limitingA) {
        limitingA = da
        limitedBy = d.id
        path = [...out.get(d.id)!.path, id]
      }
    }
    avail.set(id, a)
    out.set(id, { id, declared: svc.slo, projected: a * 100, limitedBy, path })
    return a
  }
  for (const s of model.services) compute(s.id)
  return out
}
