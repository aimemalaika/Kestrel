import { NamespacePicker } from './NamespacePicker'

export function TopBar() {
  return (
    <header
      style={{
        height: 56,
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-4)',
        padding: '0 var(--space-6)',
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <NamespacePicker />
      <strong style={{ color: 'var(--text)' }}>Kestrel</strong>
    </header>
  )
}
