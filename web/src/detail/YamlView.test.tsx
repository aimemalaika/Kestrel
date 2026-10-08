import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { YamlView } from './YamlView'
import type { K8sObject } from '../contract/types'

const pod: K8sObject = {
  apiVersion: 'v1',
  kind: 'Pod',
  metadata: { name: 'web-1', namespace: 'default' },
  status: { phase: 'Running' },
}

describe('YamlView', () => {
  it('serializes the object to YAML and renders it', () => {
    const { container } = render(<YamlView object={pod} />)
    const text = container.textContent ?? ''
    expect(text).toContain('kind: Pod')
    expect(text).toContain('name: web-1')
    expect(text).toContain('phase: Running')
  })

  it('applies highlight.js markup', () => {
    const { container } = render(<YamlView object={pod} />)
    expect(container.querySelector('.hljs, .hljs-attr')).not.toBeNull()
  })
})
