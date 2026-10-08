import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createMockClient } from '../MockClient'
import { isDeltaEnvelope, type WatchEnvelope } from '../../contract/types'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('MockClient', () => {
  it('exposes a non-empty catalog', async () => {
    const c = createMockClient()
    const cat = await c.catalog()
    expect(cat.length).toBeGreaterThan(0)
    expect(cat[0]).toHaveProperty('kind')
  })

  it('bursts initial-sync added events on subscribe, then emits deltas on tick', () => {
    const c = createMockClient({ tickMs: 1000 })
    const events: WatchEnvelope[] = []
    const stop = c.watch(
      { group: 'core', version: 'v1', resource: 'pods' },
      { namespace: 'default' },
      (e) => events.push(e),
    )
    expect(events.some((e) => e.type === 'added')).toBe(true)
    const afterSync = events.length
    vi.advanceTimersByTime(1000)
    expect(events.length).toBeGreaterThan(afterSync)
    expect(events.slice(afterSync).every(isDeltaEnvelope)).toBe(true)
    stop()
  })

  it('stops emitting after unsubscribe', () => {
    const c = createMockClient({ tickMs: 1000 })
    const events: WatchEnvelope[] = []
    const stop = c.watch({ group: 'core', version: 'v1', resource: 'pods' }, {}, (e) =>
      events.push(e),
    )
    stop()
    const n = events.length
    vi.advanceTimersByTime(5000)
    expect(events.length).toBe(n)
  })

  it('canI allows by default', async () => {
    const c = createMockClient()
    const res = await c.canI({
      verb: 'delete',
      group: 'core',
      version: 'v1',
      resource: 'pods',
      namespace: 'default',
      name: 'p1',
    })
    expect(res.allowed).toBe(true)
  })
})

describe('MockClient namespaces', () => {
  it('lists namespaces in the catalog', async () => {
    const c = createMockClient()
    const cat = await c.catalog()
    expect(cat.some((e) => e.resource === 'namespaces' && e.group === 'core')).toBe(true)
  })

  it('bursts namespace objects on watch', () => {
    const c = createMockClient({ tickMs: 100000 })
    const names: string[] = []
    const stop = c.watch({ group: 'core', version: 'v1', resource: 'namespaces' }, {}, (e) => {
      if ('object' in e && e.object.kind === 'Namespace') names.push(e.object.metadata.name)
    })
    expect(names).toContain('default')
    expect(names.length).toBeGreaterThanOrEqual(2)
    stop()
  })
})

describe('MockClient events', () => {
  it('bursts Event objects with involvedObject on watch', () => {
    const c = createMockClient({ tickMs: 100000 })
    const evs: string[] = []
    const stop = c.watch({ group: 'core', version: 'v1', resource: 'events' }, {}, (e) => {
      if ('object' in e && e.object.kind === 'Event') {
        const io = e.object.involvedObject as { name?: string } | undefined
        if (io?.name) evs.push(io.name)
      }
    })
    expect(evs.filter((n) => n === 'web-1').length).toBeGreaterThanOrEqual(2)
    stop()
  })
})

describe('MockClient exec + portForward', () => {
  it('exec echoes sent data and a banner', () => {
    const c = createMockClient()
    const out: string[] = []
    const s = c.exec({
      group: 'core',
      version: 'v1',
      resource: 'pods',
      namespace: 'default',
      name: 'web-1',
    })
    s.onData((d) => out.push(d))
    s.send('hello')
    expect(out.join('')).toContain('hello')
    s.close()
  })

  it('portForward returns an active session that closes', () => {
    const c = createMockClient()
    const pf = c.portForward(
      { group: 'core', version: 'v1', resource: 'pods', namespace: 'default', name: 'web-1' },
      8080,
      80,
    )
    expect(pf.status).toBe('active')
    expect(pf.localPort).toBe(8080)
    pf.close()
    expect(pf.status).toBe('closed')
  })
})

describe('MockClient apply dryRun + canI', () => {
  it('dryRun apply returns the object without persisting', async () => {
    const c = createMockClient()
    const obj = { apiVersion: 'v1', kind: 'Pod', metadata: { name: 'tmp', namespace: 'default' } }
    const res = await c.apply(obj, { dryRun: true })
    expect(res.metadata.name).toBe('tmp')
    await expect(
      c.get({ group: 'core', version: 'v1', resource: 'pods', namespace: 'default', name: 'tmp' }),
    ).rejects.toBeTruthy()
  })
  it('canI denies delete in kube-system, allows elsewhere', async () => {
    const c = createMockClient()
    const base = { group: 'core', version: 'v1', resource: 'pods', name: 'x' }
    expect((await c.canI({ verb: 'delete', namespace: 'kube-system', ...base })).allowed).toBe(
      false,
    )
    expect((await c.canI({ verb: 'delete', namespace: 'default', ...base })).allowed).toBe(true)
    expect((await c.canI({ verb: 'update', namespace: 'kube-system', ...base })).allowed).toBe(true)
  })
})

describe('MockClient pipelineruns', () => {
  it('catalog includes pipelineruns and watch bursts seeded runs with scan results', async () => {
    const c = createMockClient()
    expect((await c.catalog()).some((e) => e.resource === 'pipelineruns')).toBe(true)
    type Result = { name: string }
    type PipelineRunStatus = { results: Result[]; taskRuns: { steps: unknown[] }[] }
    const objs: { kind?: string; status: PipelineRunStatus }[] = []
    const stop = c.watch(
      { group: 'tekton.dev', version: 'v1', resource: 'pipelineruns' },
      {},
      (e) => {
        if (isDeltaEnvelope(e) && e.type === 'added')
          objs.push(e.object as unknown as { kind?: string; status: PipelineRunStatus })
      },
    )
    stop()
    expect(objs.length).toBeGreaterThanOrEqual(2)
    expect(objs.every((o) => o.kind === 'PipelineRun')).toBe(true)
    const names = (o: (typeof objs)[number]) => o.status.results.map((r) => r.name)
    expect(objs.some((o) => names(o).some((n) => n.endsWith('SCAN_OUTPUT')))).toBe(true)
    expect(objs.some((o) => o.status.results.length === 0)).toBe(true)
    expect(objs[0].status.taskRuns[0].steps.length).toBeGreaterThan(0)
  })
})

describe('MockClient U7 seeds', () => {
  const collect = (gvr: { group: string; version: string; resource: string }) => {
    const c = createMockClient()
    const events: WatchEnvelope[] = []
    const stop = c.watch(gvr, {}, (e) => events.push(e))
    stop()
    return events
  }

  it('catalog includes applications', async () => {
    const cat = await createMockClient().catalog()
    expect(cat.some((e) => e.resource === 'applications' && e.group === 'argoproj.io')).toBe(true)
  })

  it('bursts seeded Applications with sync/health status', () => {
    const apps = collect({ group: 'argoproj.io', version: 'v1alpha1', resource: 'applications' })
    expect(apps.length).toBeGreaterThanOrEqual(2)
    for (const e of apps) {
      const o = (e as { object: { status?: any } }).object
      expect(o.status.sync.status).toBeTruthy()
      expect(o.status.health.status).toBeTruthy()
      expect(o.status.resources.length).toBeGreaterThan(0)
    }
  })

  it('nodes carry conditions and at least one taint', () => {
    const nodes = collect({ group: 'core', version: 'v1', resource: 'nodes' }).map(
      (e) => (e as { object: { spec?: any; status?: any } }).object,
    )
    expect(nodes.length).toBeGreaterThanOrEqual(2)
    expect(nodes.every((n) => n.status.conditions.length > 0)).toBe(true)
    expect(nodes.some((n) => n.spec.taints.length > 0)).toBe(true)
  })
})
