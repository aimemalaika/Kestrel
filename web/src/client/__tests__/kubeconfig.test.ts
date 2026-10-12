import { describe, it, expect, vi, afterEach } from 'vitest'
import { createHttpClient } from '../HttpClient'

afterEach(() => vi.restoreAllMocks())

describe('kubeconfig client methods', () => {
  it('kubeconfigUrl() points at the download endpoint', () => {
    expect(createHttpClient().kubeconfigUrl()).toBe('/api/kubeconfig')
  })

  it('loginCommand() GETs /api/kubeconfig/command and returns the parsed command', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ command: 'kubectl config ...' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    const out = await createHttpClient().loginCommand()
    expect(String(fetchSpy.mock.calls[0][0])).toBe('/api/kubeconfig/command')
    expect(out.command).toBe('kubectl config ...')
  })
})
