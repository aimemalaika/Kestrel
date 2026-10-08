import { StatusBadge } from '../ui'

// Thin wrapper kept for existing callers; tones come from R1's StatusBadge map.
export function StatusPill({ value }: { value: string }) {
  return <StatusBadge status={value} />
}
