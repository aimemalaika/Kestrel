import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

const write = vi.fn()
vi.mock('@xterm/xterm', () => ({
  Terminal: class {
    open() {}
    write = write
    loadAddon() {}
    onData() {
      return { dispose() {} }
    }
    onResize() {
      return { dispose() {} }
    }
    cols = 80
    rows = 24
    dispose() {}
  },
}))
vi.mock('@xterm/addon-fit', () => ({
  FitAddon: class {
    fit() {}
  },
}))
vi.mock('@xterm/xterm/css/xterm.css', () => ({}))

import { Terminal } from './Terminal'

const pod = { group: 'core', version: 'v1', resource: 'pods', namespace: 'default', name: 'web-1' }

describe('Terminal', () => {
  it('mounts an xterm host and writes the echo banner', () => {
    render(<Terminal pod={pod} />)
    expect(screen.getByTestId('terminal-host')).toBeInTheDocument()
    expect(write).toHaveBeenCalled() // banner from the mock exec session
  })
})
