import type { ResourceRef } from '../client/Client'
export function DeleteButton({ target, disabled }: { target: ResourceRef; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      style={{
        padding: '4px var(--space-3)',
        borderRadius: 'var(--r-badge)',
        border: '1px solid var(--border)',
        background: 'var(--surface)',
        color: 'var(--risk-fg)',
        cursor: 'pointer',
      }}
    >
      Delete {target.name}
    </button>
  )
}
