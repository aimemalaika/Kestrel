import { describe, it, expect } from 'vitest'
import { ADMIN_NAV, DEV_NAV, navFor, customResourceSection } from './categoryMap'

describe('nav model', () => {
  it('admin sections mirror the mock order', () => {
    expect(ADMIN_NAV.map((s) => s.section)).toEqual([
      'Home',
      'Operators',
      'Workloads',
      'Networking',
      'Storage',
      'CI/CD',
      'Triggers',
      'Observe',
      'Compute',
      'User Management',
      'Administration',
    ])
  })

  it('developer sections mirror the mock order', () => {
    expect(DEV_NAV.map((s) => s.section)).toEqual([
      'Developer',
      'CI/CD',
      'Workloads',
      'Networking',
      'Observe',
      'Configuration',
    ])
  })

  it('navFor picks the set by perspective', () => {
    expect(navFor('admin')).toBe(ADMIN_NAV)
    expect(navFor('developer')).toBe(DEV_NAV)
  })

  it('has unique labels per section', () => {
    for (const s of [...ADMIN_NAV, ...DEV_NAV]) {
      const labels = s.items.map((i) => i.label)
      expect(new Set(labels).size).toBe(labels.length)
    }
  })

  it('every item has a target (none are permanently dimmed)', () => {
    for (const s of [...ADMIN_NAV, ...DEV_NAV]) {
      for (const i of s.items) expect(i.target, `${s.section}/${i.label}`).toBeDefined()
    }
  })

  it('maps known routes and the Service Map under Observe', () => {
    const find = (nav: typeof ADMIN_NAV, sec: string, label: string) =>
      nav.find((s) => s.section === sec)!.items.find((i) => i.label === label)!.target
    expect(find(ADMIN_NAV, 'Observe', 'Service Map')).toEqual({ route: '/servicemap' })
    expect(find(ADMIN_NAV, 'Operators', 'Installed Operators')).toEqual({ route: '/operators' })
    expect(find(ADMIN_NAV, 'Administration', 'Cluster Settings')).toEqual({
      route: '/cluster/settings',
    })
    expect(find(ADMIN_NAV, 'CI/CD', 'Registry')).toEqual({ route: '/registry' })
    expect(find(DEV_NAV, 'Developer', 'Topology')).toEqual({ route: '/topology' })
  })

  it('lists StepActions and CustomRuns under CI/CD via res()', () => {
    const pipelines = ADMIN_NAV.find((s) => s.section === 'CI/CD')!
    const target = (label: string) => pipelines.items.find((i) => i.label === label)!.target
    expect(target('StepActions')).toEqual({ resource: 'stepactions' })
    expect(target('CustomRuns')).toEqual({ resource: 'customruns' })
  })

  it('has a Triggers section with the 7 res() items after CI/CD', () => {
    const names = ADMIN_NAV.map((s) => s.section)
    expect(names.indexOf('Triggers')).toBe(names.indexOf('CI/CD') + 1)
    const sec = ADMIN_NAV.find((s) => s.section === 'Triggers')!
    expect(sec.items.map((i) => i.target)).toEqual([
      { resource: 'eventlisteners' },
      { resource: 'triggers' },
      { resource: 'triggerbindings' },
      { resource: 'triggertemplates' },
      { resource: 'clustertriggerbindings' },
      { resource: 'interceptors' },
      { resource: 'clusterinterceptors' },
    ])
  })
})

describe('customResourceSection', () => {
  const entry = (group: string, resource: string, kind: string, version = 'v1') => ({
    group,
    version,
    resource,
    kind,
    namespaced: true,
    verbs: ['list'],
  })

  it('surfaces non-built-in groups as a Custom Resources section, excluding built-ins, subresources, and static dupes', () => {
    const catalog = [
      entry('', 'pods', 'Pod'), // core → built-in, excluded
      entry('apps', 'deployments', 'Deployment'), // built-in, excluded
      entry('rbac.authorization.k8s.io', 'roles', 'Role'), // *.k8s.io built-in, excluded
      entry('tekton.dev', 'pipelineruns', 'PipelineRun'), // in static nav → deduped
      entry('argoproj.io', 'applications', 'Application'),
      entry('example.com', 'widgets/status', 'Widget'), // subresource → excluded
      entry('example.com', 'widgets', 'Widget'),
    ]
    const sec = customResourceSection(catalog, ADMIN_NAV)
    expect(sec).not.toBeNull()
    expect(sec!.section).toBe('Custom Resources')
    // Only the custom resources not already in the static nav, sorted by group
    // then resource (argoproj.io < example.com).
    expect(sec!.items.map((i) => i.label)).toEqual(['Application', 'Widget'])
    expect(sec!.items[0].target).toEqual({
      gvr: { group: 'argoproj.io', version: 'v1', resource: 'applications' },
    })
  })

  it('returns null when there are no custom resources', () => {
    expect(
      customResourceSection(
        [entry('', 'pods', 'Pod'), entry('apps', 'deployments', 'Deployment')],
        ADMIN_NAV,
      ),
    ).toBeNull()
    expect(customResourceSection([], ADMIN_NAV)).toBeNull()
  })
})
