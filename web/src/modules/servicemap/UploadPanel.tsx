import { useState } from 'react'
import { Card, PrimaryBtn, SecondaryBtn } from '../../ui'
import { SAMPLE_YAML } from './sample'

// Two distinct actions so viewing the sample never overwrites the stored
// cluster map: onPreview renders YAML client-side (no network) and powers the
// "Load sample" affordance; onSubmit persists+validates the real upload via a
// server PUT. `pending` disables the submit controls while a PUT is in flight.
export function UploadPanel({
  onPreview,
  onSubmit,
  pending = false,
}: {
  onPreview: (yamlText: string) => void
  onSubmit: (yamlText: string) => void
  pending?: boolean
}) {
  const [text, setText] = useState('')
  return (
    <Card className="p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs text-zinc-300">
          <span className="mr-2">Upload services.yaml</span>
          <input
            type="file"
            accept=".yaml,.yml"
            aria-label="Upload services.yaml"
            className="text-xs text-zinc-400"
            disabled={pending}
            onChange={async (e) => {
              const f = e.target.files?.[0]
              if (f) {
                const t = await f.text()
                setText(t)
                onSubmit(t)
              }
            }}
          />
        </label>
        <SecondaryBtn
          disabled={pending}
          onClick={() => {
            setText(SAMPLE_YAML)
            onPreview(SAMPLE_YAML)
          }}
        >
          Load sample
        </SecondaryBtn>
      </div>
      <textarea
        aria-label="ServiceMap YAML"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="…or paste a ServiceMap YAML here"
        rows={6}
        className="w-full bg-zinc-950 border border-zinc-800 rounded-md p-2 text-xs font-mono text-zinc-200"
      />
      <PrimaryBtn onClick={() => onSubmit(text)} disabled={!text.trim() || pending}>
        {pending ? 'Saving…' : 'Render map'}
      </PrimaryBtn>
    </Card>
  )
}
