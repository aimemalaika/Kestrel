import { useState } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { yaml as yamlLang } from '@codemirror/lang-yaml'
import yaml from 'js-yaml'
import { diffLines, type Change } from 'diff'
import { createClient } from '../client/createClient'
import type { K8sObject } from '../contract/types'
import { useToast } from '../toast/ToastProvider'
import { DiffView } from './DiffView'

const dump = (o: unknown) => yaml.dump(o, { noRefs: true, sortKeys: false, skipInvalid: true })
const btn = (kind: 'ghost' | 'primary') => ({
  padding: '6px var(--space-3)',
  borderRadius: 'var(--r-badge)',
  cursor: 'pointer',
  border: kind === 'ghost' ? '1px solid var(--border)' : 'none',
  background: kind === 'ghost' ? 'var(--surface)' : 'var(--brand-600)',
  color: kind === 'ghost' ? 'var(--text)' : 'var(--surface)',
})

function parse(text: string): K8sObject {
  const obj = yaml.load(text)
  if (
    !obj ||
    typeof obj !== 'object' ||
    Array.isArray(obj) ||
    typeof (obj as { apiVersion?: unknown }).apiVersion !== 'string' ||
    typeof (obj as { kind?: unknown }).kind !== 'string' ||
    typeof (obj as { metadata?: { name?: unknown } }).metadata?.name !== 'string'
  ) {
    throw new Error('YAML must be a Kubernetes object (apiVersion, kind, metadata.name)')
  }
  return obj as K8sObject
}

export default function YamlEditor({ object }: { object: K8sObject }) {
  const toast = useToast()
  const original = dump(object)
  const [text, setText] = useState(original)
  const [diff, setDiff] = useState<Change[] | null>(null)

  const preview = async () => {
    try {
      const edited = parse(text)
      const merged = await createClient().apply(edited, { dryRun: true })
      setDiff(diffLines(original, dump(merged)))
    } catch (e) {
      toast('error', `Invalid YAML: ${(e as Error).message}`)
    }
  }
  const apply = async () => {
    try {
      const edited = parse(text)
      await createClient().apply(edited)
      toast('ok', `Applied ${edited.metadata.name}`)
      setDiff(null)
    } catch (e) {
      const err = e as { error?: string; message?: string }
      toast('error', err.error ?? err.message ?? 'Apply failed')
    }
  }

  return (
    <div>
      <CodeMirror value={text} extensions={[yamlLang()]} onChange={setText} height="300px" />
      <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-3)' }}>
        <button type="button" onClick={preview} style={btn('ghost')}>
          Preview changes
        </button>
        <button type="button" onClick={apply} style={btn('primary')}>
          Apply
        </button>
      </div>
      {diff && <DiffView parts={diff} />}
    </div>
  )
}
