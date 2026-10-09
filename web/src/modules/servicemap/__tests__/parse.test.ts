import { describe, it, expect } from 'vitest'
import { parseServiceMap } from '../parse'
import { SAMPLE_YAML } from '../sample'

const wrap = (services: string) =>
  `apiVersion: kestrel.dev/v1\nkind: ServiceMap\nmetadata: {name: t}\nservices:\n${services}`

function errs(y: string) {
  const r = parseServiceMap(y)
  if (r.ok) throw new Error('expected failure')
  return r.errors.map((e) => e.message).join('\n')
}

describe('parseServiceMap', () => {
  it('parses the sample with defaults', () => {
    const r = parseServiceMap(SAMPLE_YAML)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.model.name).toBe('payments-platform')
    const ledger = r.model.services.find((s) => s.id === 'ledger')!
    expect(ledger.displayName).toBe('ledger')
    expect(ledger.dependsOn).toEqual([])
    const pay = r.model.services.find((s) => s.id === 'payments')!
    expect(pay.dependsOn[0]).toEqual({ id: 'ledger', critical: true })
    const co = r.model.services.find((s) => s.id === 'checkout')!
    expect(co.displayName).toBe('Checkout API')
    expect(co.dependsOn[1]).toEqual({ id: 'inventory', protocol: 'grpc', critical: false })
  })
  it('rejects dangling refs', () => {
    expect(errs(wrap('  - {id: a, slo: 99, dependsOn: [{id: zz}]}'))).toMatch(
      /undeclared service "zz"/,
    )
  })
  it('rejects duplicate ids', () => {
    expect(errs(wrap('  - {id: a, slo: 99}\n  - {id: a, slo: 99}'))).toMatch(
      /Duplicate service id "a"/,
    )
  })
  it('rejects bad slo', () => {
    expect(errs(wrap('  - {id: a, slo: 0}'))).toMatch(/slo/)
    expect(errs(wrap('  - {id: a, slo: 101}'))).toMatch(/slo/)
  })
  it('rejects cycles', () => {
    const m = errs(
      wrap(
        '  - {id: a, slo: 99, dependsOn: [{id: b}]}\n  - {id: b, slo: 99, dependsOn: [{id: a}]}',
      ),
    )
    expect(m).toMatch(/cycle/i)
    expect(m).toMatch(/a/)
    expect(m).toMatch(/b/)
  })
  it('rejects bad workload', () => {
    expect(errs(wrap('  - {id: a, slo: 99, workload: {namespace: x}}'))).toMatch(/workload/)
    expect(errs(wrap('  - {id: a, slo: 99, workload: {kind: Deployment, name: a}}'))).toMatch(
      /workload/,
    )
  })
  it('accepts selector workload', () => {
    expect(
      parseServiceMap(wrap('  - {id: a, slo: 99, workload: {namespace: x, selector: {app: a}}}'))
        .ok,
    ).toBe(true)
  })
  it('rejects apiVersion/kind mismatch and non-objects', () => {
    expect(errs('apiVersion: v2\nkind: Nope\nservices: []')).toMatch(/apiVersion/)
    expect(errs('apiVersion: v2\nkind: Nope\nservices: []')).toMatch(/kind/)
    expect(errs('just a string')).toMatch(/mapping/)
  })
})
