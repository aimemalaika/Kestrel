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
})
