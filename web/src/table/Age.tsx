import { ageString } from './columns'

export function Age({ creationTimestamp }: { creationTimestamp?: string }) {
  return <span>{ageString(creationTimestamp)}</span>
}
