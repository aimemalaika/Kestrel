import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createMockClient } from '../MockClient'
import { setIdentity, IDENTITY_PRESETS } from '../../auth/identity'
import { isDeltaEnvelope, type WatchEnvelope } from '../../contract/types'

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  vi.useRealTimers()
  setIdentity(null)
})

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
    type AppStatus = {
      sync: { status: string }
      health: { status: string }
      resources: unknown[]
    }
    for (const e of apps) {
      const o = (e as unknown as { object: { status: AppStatus } }).object
      expect(o.status.sync.status).toBeTruthy()
      expect(o.status.health.status).toBeTruthy()
      expect(o.status.resources.length).toBeGreaterThan(0)
    }
  })

  it('nodes carry conditions and at least one taint', () => {
    type NodeShape = {
      spec: { taints: unknown[] }
      status: { conditions: unknown[]; usage: { cpu: string; memory: string } }
    }
    const nodes = collect({ group: 'core', version: 'v1', resource: 'nodes' }).map(
      (e) => (e as unknown as { object: NodeShape }).object,
    )
    expect(nodes).toHaveLength(6)
    expect(nodes.every((n) => n.status.conditions.length > 0)).toBe(true)
    expect(nodes.some((n) => n.spec.taints.length > 0)).toBe(true)
    expect(
      nodes.every((n) => Number(n.status.usage.cpu) >= 0 && Number(n.status.usage.memory) >= 0),
    ).toBe(true)
  })

  it('pods carry status.usage as raw cpu/memory quantities', () => {
    const pods = collect({ group: 'core', version: 'v1', resource: 'pods' }).map(
      (e) =>
        (e as unknown as { object: { status: { usage?: { cpu: string; memory: string } } } })
          .object,
    )
    const withUsage = pods.filter((p) => p.status.usage)
    expect(withUsage.length).toBeGreaterThan(0)
    // Raw quantities (millicores / Mi-Gi), shown verbatim — not bare percents.
    expect(withUsage.every((p) => /\d/.test(p.status.usage!.cpu))).toBe(true)
    expect(withUsage.some((p) => /Mi|Gi/.test(p.status.usage!.memory))).toBe(true)
  })
})

describe('MockClient canI identity', () => {
  const [operator, viewer] = IDENTITY_PRESETS
  const pods = { group: 'core', version: 'v1', resource: 'pods' }

  it('viewer denies writes and allows reads', async () => {
    setIdentity(viewer)
    const c = createMockClient()
    expect((await c.canI({ ...pods, verb: 'delete', namespace: 'default' })).allowed).toBe(false)
    expect((await c.canI({ ...pods, verb: 'get', namespace: 'default' })).allowed).toBe(true)
  })

  it('operator allows delete in default, denies in kube-system', async () => {
    setIdentity(operator)
    const c = createMockClient()
    expect((await c.canI({ ...pods, verb: 'delete', namespace: 'default' })).allowed).toBe(true)
    expect((await c.canI({ ...pods, verb: 'delete', namespace: 'kube-system' })).allowed).toBe(
      false,
    )
  })
})

describe('MockClient generic resources (R9)', () => {
  const kinds: [string, string, boolean][] = [
    ['services', 'core', true],
    ['configmaps', 'core', true],
    ['secrets', 'core', true],
    ['persistentvolumes', 'core', false],
    ['persistentvolumeclaims', 'core', true],
    ['storageclasses', 'storage.k8s.io', false],
    ['serviceaccounts', 'core', true],
    ['roles', 'rbac.authorization.k8s.io', true],
    ['rolebindings', 'rbac.authorization.k8s.io', true],
    ['routes', 'route.openshift.io', true],
    ['resourcequotas', 'core', true],
  ]
  it('catalog includes the new kinds with correct scope', async () => {
    const cat = await createMockClient().catalog()
    for (const [resource, group, namespaced] of kinds) {
      const e = cat.find((c) => c.resource === resource)
      expect(e, resource).toBeDefined()
      expect(e!.group).toBe(group)
      expect(e!.namespaced).toBe(namespaced)
    }
  })
  it('watch bursts seeds for each new kind', () => {
    const c = createMockClient({ tickMs: 1000 })
    for (const [resource, group] of kinds) {
      const evs: WatchEnvelope[] = []
      const stop = c.watch({ group, version: 'v1', resource }, {}, (e) => evs.push(e))
      stop()
      expect(evs.length, resource).toBeGreaterThanOrEqual(1)
    }
  })
})

describe('MockClient completeness catalog', () => {
  const kinds: [string, string, string, boolean][] = [
    ['statefulsets', 'apps', 'v1', true],
    ['jobs', 'batch', 'v1', true],
    ['ingresses', 'networking.k8s.io', 'v1', true],
    ['taskruns', 'tekton.dev', 'v1', true],
    ['clusterroles', 'rbac.authorization.k8s.io', 'v1', false],
    ['customresourcedefinitions', 'apiextensions.k8s.io', 'v1', false],
    ['machinesets', 'machine.openshift.io', 'v1beta1', true],
    ['clusteroperators', 'config.openshift.io', 'v1', false],
    ['clusterserviceversions', 'operators.coreos.com', 'v1alpha1', true],
  ]
  it('catalog includes the new resources with correct scope', async () => {
    const cat = await createMockClient().catalog()
    for (const [resource, group, , namespaced] of kinds) {
      const e = cat.find((c) => c.resource === resource)
      expect(e, resource).toBeDefined()
      expect(e!.group).toBe(group)
      expect(e!.namespaced).toBe(namespaced)
    }
  })
  it('watch bursts seeds for the new GVRs', () => {
    const c = createMockClient({ tickMs: 1000 })
    for (const [resource, group, version] of kinds) {
      const evs: WatchEnvelope[] = []
      const stop = c.watch({ group, version, resource }, {}, (e) => evs.push(e))
      stop()
      expect(evs.length, resource).toBeGreaterThanOrEqual(2)
    }
  })
})

describe('MockClient populated seeds', () => {
  type Obj = {
    metadata: { name: string; namespace?: string; creationTimestamp: string }
    [k: string]: unknown
  }
  const list = (group: string, resource: string, version = 'v1'): Obj[] => {
    const out: Obj[] = []
    const stop = createMockClient({ tickMs: 100000 }).watch(
      { group, version, resource },
      {},
      (e) => {
        if (isDeltaEnvelope(e)) out.push(e.object as unknown as Obj)
      },
    )
    stop()
    return out
  }
  const at = (o: unknown, path: string): unknown =>
    path.split('.').reduce<unknown>((a, k) => (a as Record<string, unknown> | undefined)?.[k], o)

  it('varies creation timestamps across seeds', () => {
    const services = list('core', 'services')
    expect(services.length).toBeGreaterThanOrEqual(8)
    expect(new Set(services.map((s) => s.metadata.creationTimestamp)).size).toBeGreaterThan(3)
  })
  it('routes carry admission status with at least one rejected', () => {
    const routes = list('route.openshift.io', 'routes')
    expect(routes.length).toBeGreaterThanOrEqual(6)
    const admitted = routes.map(
      (r) =>
        (at(r, 'status.ingress') as { conditions: { status: string }[] }[])[0].conditions[0].status,
    )
    expect(admitted).toContain('False')
    expect(admitted).toContain('True')
  })
  it('has a default StorageClass', () => {
    const scs = list('storage.k8s.io', 'storageclasses')
    expect(
      scs.filter(
        (s) =>
          at(s, 'metadata.annotations')?.['storageclass.kubernetes.io/is-default-class' as never],
      ),
    ).toHaveLength(1)
  })
  it('has a Degraded ClusterOperator and available updates', () => {
    const ops = list('config.openshift.io', 'clusteroperators')
    const degraded = ops.filter((o) =>
      (at(o, 'status.conditions') as { type: string; status: string }[]).some(
        (c) => c.type === 'Degraded' && c.status === 'True',
      ),
    )
    expect(degraded.length).toBeGreaterThanOrEqual(1)
    expect(ops.length).toBeGreaterThanOrEqual(10)
    const cv = list('config.openshift.io', 'clusterversions')[0]
    expect((at(cv, 'status.availableUpdates') as unknown[]).length).toBeGreaterThan(0)
  })
  it('pipeline runs cover running and cancelled states in several namespaces', () => {
    const runs = list('tekton.dev', 'pipelineruns')
    const reasons = runs.map((r) => (at(r, 'status.conditions') as { reason: string }[])[0].reason)
    expect(reasons).toContain('Running')
    expect(reasons).toContain('Cancelled')
    expect(new Set(runs.map((r) => r.metadata.namespace)).size).toBeGreaterThanOrEqual(3)
  })
  it('namespaces have display names and quotas cover production/staging', () => {
    const nss = list('core', 'namespaces')
    expect(nss.every((n) => at(n, 'metadata.annotations'))).toBe(true)
    const q = list('core', 'resourcequotas').map((x) => x.metadata.namespace)
    expect(q).toEqual(expect.arrayContaining(['production', 'staging']))
  })
})
