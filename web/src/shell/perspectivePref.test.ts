import { describe, it, expect, afterEach, vi } from 'vitest'
import { loadDefaultPerspective, saveDefaultPerspective } from './perspectivePref'

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('perspectivePref', () => {
  it('round-trips a saved perspective', () => {
    saveDefaultPerspective('developer')
    expect(loadDefaultPerspective()).toBe('developer')
  })

  it('defaults to admin for a missing or garbage value', () => {
    expect(loadDefaultPerspective()).toBe('admin')
    localStorage.setItem('kestrel.defaultPerspective', 'nonsense')
    expect(loadDefaultPerspective()).toBe('admin')
  })

  it('does not throw when localStorage getItem throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(loadDefaultPerspective()).toBe('admin')
  })
})
