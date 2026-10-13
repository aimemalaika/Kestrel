import type { K8sObject } from '../../contract/types'
import { StatusBadge } from '../../ui'
import { chainsInfo } from './model'

/** Tekton Chains signature status + transparency-log link for a run. */
export function SigningBadge({ object }: { object: K8sObject }) {
  const { signed, transparencyUrl } = chainsInfo(object)
  return (
    <div className="flex items-center gap-3">
      <StatusBadge status={signed ? 'Signed' : 'Unsigned'} />
      {transparencyUrl && (
        <a
          href={transparencyUrl}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-blue-400 hover:underline"
        >
          View transparency log
        </a>
      )}
    </div>
  )
}
