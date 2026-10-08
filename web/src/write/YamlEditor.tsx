import { useState } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { yaml as yamlLang } from '@codemirror/lang-yaml'
import yaml from 'js-yaml'
import { diffLines, type Change } from 'diff'
import { createClient } from '../client/createClient'
import type { K8sObject } from '../contract/types'
import { useToast } from '../toast/ToastProvider'
import { EditorView } from '@codemirror/view'
import { PrimaryBtn, SecondaryBtn } from '../ui'
import { DiffView } from './DiffView'

const darkTheme = EditorView.theme(
  {
    '&': { backgroundColor: '#0d1117', color: '#b0c4de' },
    '.cm-content': { caretColor: '#ee6060', fontFamily: 'ui-monospace, Menlo, monospace' },
    '.cm-cursor': { borderLeftColor: '#ee6060' },
    '.cm-gutters': { backgroundColor: '#0d1117', color: '#52525b', border: 'none' },
    '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: '#ffffff08' },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
      backgroundColor: '#3f3f46',
    },
  },
  { dark: true },
)

const dump = (o: unknown) => yaml.dump(o, { noRefs: true, sortKeys: false, skipInvalid: true })

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
      <div className="rounded-md border border-zinc-800 overflow-hidden">
        <CodeMirror
          value={text}
          theme="dark"
          extensions={[yamlLang(), darkTheme]}
          onChange={setText}
          height="300px"
        />
      </div>
      <div className="flex gap-3 mt-3">
        <SecondaryBtn onClick={preview}>Preview changes</SecondaryBtn>
        <PrimaryBtn onClick={apply}>Apply</PrimaryBtn>
      </div>
      {diff && <DiffView parts={diff} />}
    </div>
  )
}
