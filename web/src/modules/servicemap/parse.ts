import yaml from 'js-yaml'
import type { ParseResult, ServiceDep, ServiceNodeModel, ValidationError } from './types'

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0

export function parseServiceMap(yamlText: string): ParseResult {
  let doc: unknown
  try {
    doc = yaml.load(yamlText)
  } catch (e) {
    return { ok: false, errors: [{ message: `Invalid YAML: ${(e as Error).message}` }] }
  }
  if (!isObj(doc)) {
    return { ok: false, errors: [{ message: 'Document must be a YAML mapping' }] }
  }
  const errors: ValidationError[] = []
  if (doc.apiVersion !== 'kestrel.dev/v1') {
    errors.push({ message: `apiVersion must be "kestrel.dev/v1" (got ${String(doc.apiVersion)})` })
  }
  if (doc.kind !== 'ServiceMap') {
    errors.push({ message: `kind must be "ServiceMap" (got ${String(doc.kind)})` })
  }
  if (!Array.isArray(doc.services)) {
    errors.push({ message: 'services must be a list' })
    return { ok: false, errors }
  }
  const meta = isObj(doc.metadata) ? doc.metadata : {}
  const name = isStr(meta.name) ? meta.name : 'service-map'

  const services: ServiceNodeModel[] = []
  const seen = new Set<string>()
  doc.services.forEach((raw, i) => {
    if (!isObj(raw)) {
      errors.push({ message: `services[${i}] must be a mapping` })
      return
    }
    if (!isStr(raw.id)) {
      errors.push({ message: `services[${i}] is missing a required "id"` })
      return
    }
    const id = raw.id
    if (seen.has(id)) errors.push({ message: `Duplicate service id "${id}"`, serviceId: id })
    seen.add(id)

    const slo = raw.slo
    if (typeof slo !== 'number' || !(slo > 0 && slo <= 100)) {
      errors.push({
        message: `Service "${id}": slo must be a number where 0 < slo <= 100`,
        serviceId: id,
      })
    }

    let workload: ServiceNodeModel['workload']
    if (raw.workload !== undefined) {
      const w = raw.workload
      if (!isObj(w) || !isStr(w.namespace)) {
        errors.push({ message: `Service "${id}": workload requires a namespace`, serviceId: id })
      } else if (isStr(w.kind) && isStr(w.name) && w.selector === undefined) {
        workload = { namespace: w.namespace, kind: w.kind, name: w.name }
      } else if (
        isObj(w.selector) &&
        Object.keys(w.selector).length > 0 &&
        Object.values(w.selector).every((v) => typeof v === 'string') &&
        w.name === undefined
      ) {
        workload = {
          namespace: w.namespace,
          ...(isStr(w.kind) ? { kind: w.kind } : {}),
          selector: w.selector as Record<string, string>,
        }
      } else {
        errors.push({
          message: `Service "${id}": workload must be {namespace, kind, name} or {namespace, selector}`,
          serviceId: id,
        })
      }
    }

    const dependsOn: ServiceDep[] = []
    if (raw.dependsOn !== undefined && !Array.isArray(raw.dependsOn)) {
      errors.push({ message: `Service "${id}": dependsOn must be a list`, serviceId: id })
    } else {
      for (const d of (raw.dependsOn as unknown[] | undefined) ?? []) {
        if (!isObj(d) || !isStr(d.id)) {
          errors.push({
            message: `Service "${id}": dependsOn entry is missing "id"`,
            serviceId: id,
          })
          continue
        }
        dependsOn.push({
          id: d.id,
          ...(isStr(d.protocol) ? { protocol: d.protocol } : {}),
          critical: typeof d.critical === 'boolean' ? d.critical : true,
        })
      }
    }

    services.push({
      id,
      displayName: isStr(raw.displayName) ? raw.displayName : id,
      slo: typeof slo === 'number' ? slo : 0,
      ...(workload ? { workload } : {}),
      dependsOn,
    })
  })

  for (const s of services) {
    for (const d of s.dependsOn) {
      if (!seen.has(d.id)) {
        errors.push({
          message: `Service "${s.id}" depends on undeclared service "${d.id}"`,
          serviceId: s.id,
          edge: [s.id, d.id],
        })
      }
    }
  }

  // Cycle detection (DFS colouring) over resolvable edges.
  const byId = new Map(services.map((s) => [s.id, s]))
  const colour = new Map<string, 1 | 2>() // 1 = in stack, 2 = done
  const stack: string[] = []
  const reported = new Set<string>()
  const visit = (id: string) => {
    colour.set(id, 1)
    stack.push(id)
    for (const d of byId.get(id)?.dependsOn ?? []) {
      if (!byId.has(d.id)) continue
      const c = colour.get(d.id)
      if (c === 1) {
        const cyc = stack.slice(stack.indexOf(d.id))
        const key = [...cyc].sort().join(',')
        if (!reported.has(key)) {
          reported.add(key)
          errors.push({
            message: `Dependency cycle: ${[...cyc, d.id].join(' -> ')}`,
            edge: [id, d.id],
          })
        }
      } else if (c === undefined) visit(d.id)
    }
    stack.pop()
    colour.set(id, 2)
  }
  for (const s of services) if (!colour.has(s.id)) visit(s.id)

  if (errors.length) return { ok: false, errors }
  return { ok: true, model: { name, services } }
}
