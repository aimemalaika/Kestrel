import type { K8sObject } from '../contract/types'
import { Card } from '../ui'

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 py-1 text-xs">
      <div className="w-36 shrink-0 text-zinc-500">{label}</div>
      <div className="text-zinc-200 break-words min-w-0">{children}</div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="mb-4">
      <h3 className="px-4 py-2.5 border-b border-zinc-800/80 text-xs font-semibold uppercase tracking-wide text-zinc-400 m-0">
        {title}
      </h3>
      <div className="px-4 py-3">{children}</div>
    </Card>
  )
}

export function DetailPanel({ object }: { object: K8sObject }) {
  const m = object.metadata
  const labels = Object.entries(m.labels ?? {})
  const annos = Object.entries(m.annotations ?? {})
  const owners = m.ownerReferences ?? []
  return (
    <div>
      <Section title="Metadata">
        <Row label="Name">{m.name}</Row>
        {m.namespace && <Row label="Namespace">{m.namespace}</Row>}
        <Row label="Kind">{object.kind}</Row>
        {m.uid && <Row label="UID">{m.uid}</Row>}
        {m.creationTimestamp && <Row label="Created">{m.creationTimestamp}</Row>}
      </Section>
      <Section title="Labels">
        {labels.length ? (
          labels.map(([k, v]) => (
            <Row key={k} label={k}>
              {v}
            </Row>
          ))
        ) : (
          <Row label="">none</Row>
        )}
      </Section>
      <Section title="Annotations">
        {annos.length ? (
          annos.map(([k, v]) => (
            <Row key={k} label={k}>
              {v}
            </Row>
          ))
        ) : (
          <Row label="">none</Row>
        )}
      </Section>
      <Section title="Status">
        <pre className="m-0 text-xs font-mono text-zinc-300 whitespace-pre-wrap">
          {object.status ? JSON.stringify(object.status, null, 2) : 'none'}
        </pre>
      </Section>
      <Section title="Owner references">
        {owners.length ? (
          owners.map((o) => (
            <Row key={o.uid} label={o.kind}>
              {o.name}
            </Row>
          ))
        ) : (
          <Row label="">none</Row>
        )}
      </Section>
    </div>
  )
}
