import { describe, it, expect } from 'vitest'
import { isDeltaEnvelope, type WatchEnvelope } from '../types'

describe('isDeltaEnvelope', () => {
  it('is true for added/modified/deleted and false otherwise', () => {
    const added: WatchEnvelope = { type: 'added', object: { apiVersion: 'v1', kind: 'Pod', metadata: { name: 'p1' } } }
    const err: WatchEnvelope = { type: 'error', message: 'resync' }
    const bm: WatchEnvelope = { type: 'bookmark', resourceVersion: '42' }
    expect(isDeltaEnvelope(added)).toBe(true)
    expect(isDeltaEnvelope(err)).toBe(false)
    expect(isDeltaEnvelope(bm)).toBe(false)
  })
})
