import { StatusPill } from '../../table/StatusPill'
import type { Release } from './HelmClient'

const cell = { textAlign: 'left', padding: 'var(--space-2) var(--space-3)' } as const

export function ReleaseList({
  releases,
  onSelect,
}: {
  releases: Release[]
  onSelect: (r: Release) => void
}) {
  if (releases.length === 0) return <p style={{ color: 'var(--text-muted)' }}>No releases.</p>
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }} aria-label="Releases">
      <thead>
        <tr style={{ color: 'var(--text-muted)' }}>
          {['Name', 'Namespace', 'Revision', 'Status', 'Chart', 'App version'].map((h) => (
            <th key={h} style={cell}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {releases.map((r) => (
          <tr key={`${r.namespace}/${r.name}`} style={{ borderTop: '1px solid var(--border)' }}>
            <td style={cell}>
              <button
                type="button"
                onClick={() => onSelect(r)}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  color: 'var(--brand-600)',
                  cursor: 'pointer',
                }}
              >
                {r.name}
              </button>
            </td>
            <td style={cell}>{r.namespace}</td>
            <td style={cell}>{r.revision}</td>
            <td style={cell}>
              <StatusPill value={r.status} />
            </td>
            <td style={cell}>
              {r.chart}-{r.chartVersion}
            </td>
            <td style={cell}>{r.appVersion}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
