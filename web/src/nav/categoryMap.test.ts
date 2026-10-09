import { describe, it, expect } from 'vitest'
import { ADMIN_NAV, DEV_NAV, navFor } from './categoryMap'

describe('nav model', () => {
  it('admin sections mirror the mock order', () => {
    expect(ADMIN_NAV.map((s) => s.section)).toEqual([
      'Home',
      'Operators',
      'Workloads',
      'Networking',
      'Storage',
      'Builds',
      'Pipelines',
      'Observe',
      'Compute',
      'User Management',
      'Administration',
    ])
  })

  it('developer sections mirror the mock order', () => {
    expect(DEV_NAV.map((s) => s.section)).toEqual([
      'Developer',
      'Builds',
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
    expect(find(ADMIN_NAV, 'Builds', 'ImageStreams')).toEqual({ resource: 'imagestreams' })
    expect(find(DEV_NAV, 'Developer', 'Topology')).toEqual({ route: '/topology' })
  })
})
