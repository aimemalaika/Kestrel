import type { K8sObject } from '../contract/types'

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 'var(--space-3)', padding: '4px 0' }}>
      <div style={{ width: 140, color: 'var(--text-muted)', flexShrink: 0 }}>{label}</div>
      <div style={{ color: 'var(--text)', wordBreak: 'break-word' }}>{children}</div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 'var(--space-6)' }}>
      <h3 style={{ color: 'var(--brand-600)', fontSize: 14, margin: '0 0 var(--space-2)' }}>
        {title}
      </h3>
      {children}
    </section>
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
        <pre style={{ margin: 0, color: 'var(--text)', whiteSpace: 'pre-wrap' }}>
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
