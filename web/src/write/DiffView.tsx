import type { Change } from 'diff'

export function DiffView({ parts }: { parts: Change[] }) {
  return (
    <pre
      data-testid="diff"
      style={{
        marginTop: 'var(--space-3)',
        fontSize: 12,
        overflow: 'auto',
        background: 'var(--bg)',
        padding: 'var(--space-3)',
        borderRadius: 'var(--r-badge)',
      }}
    >
      {parts.map((p, i) => (
        <div
          key={i}
          style={{
            color: p.added ? 'var(--ok-fg)' : p.removed ? 'var(--risk-fg)' : 'var(--text-muted)',
            background: p.added ? 'var(--ok-bg)' : p.removed ? 'var(--risk-bg)' : 'transparent',
            whiteSpace: 'pre-wrap',
          }}
        >
          {(p.added ? '+ ' : p.removed ? '- ' : '  ') + p.value.replace(/\n$/, '')}
        </div>
      ))}
    </pre>
  )
}
