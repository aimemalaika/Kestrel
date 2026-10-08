export function Sidebar() {
  return (
    <aside
      style={{
        width: 240,
        background: 'var(--surface)',
        borderRight: '1px solid var(--border)',
        padding: 'var(--space-4)',
      }}
    >
      <div style={{ fontWeight: 700, color: 'var(--brand-600)', marginBottom: 'var(--space-4)' }}>
        Kestrel
      </div>
      {/* NavTree mounts here in Task 4 */}
    </aside>
  )
}
