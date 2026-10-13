import { describe, it, expect } from 'vitest'
import { canAdmin, allowedPerspective } from './perspective'

describe('canAdmin', () => {
  it('is true in single-operator mode', () => {
    expect(canAdmin('single-operator', [], ['ops'])).toBe(true)
  })
  it('is true when no admin groups are configured', () => {
    expect(canAdmin('oidc', ['devs'], [])).toBe(true)
    expect(canAdmin('oidc', undefined, undefined)).toBe(true)
  })
  it('is true for a member of an admin group', () => {
    expect(canAdmin('oidc', ['devs', 'ops'], ['ops'])).toBe(true)
  })
  it('is false for a non-member or a user without groups', () => {
    expect(canAdmin('oidc', ['devs'], ['ops'])).toBe(false)
    expect(canAdmin('oidc', undefined, ['ops'])).toBe(false)
  })
})

describe('allowedPerspective', () => {
  it('keeps the stored perspective for admins', () => {
    expect(allowedPerspective('admin', true)).toBe('admin')
    expect(allowedPerspective('developer', true)).toBe('developer')
  })
  it('clamps non-admins to developer', () => {
    expect(allowedPerspective('admin', false)).toBe('developer')
  })
})
