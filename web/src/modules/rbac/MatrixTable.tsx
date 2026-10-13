import { VERBS } from './RBACClient'
import type { ResourceAccess } from './RBACClient'

export function MatrixTable({
  rows,
  showBindings = false,
}: {
  rows: ResourceAccess[]
  showBindings?: boolean
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs" aria-label="Access matrix">
        <thead>
          <tr className="border-b border-zinc-800/60 text-zinc-500">
            <th scope="col" className="py-2 pr-3 text-left font-semibold">
              Resource
            </th>
            {VERBS.map((v) => (
              <th key={v} scope="col" className="px-1.5 py-2 text-center font-semibold">
                {v}
              </th>
            ))}
            {showBindings && (
              <th scope="col" className="py-2 pl-3 text-left font-semibold">
                Granted by
              </th>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800/40">
          {rows.map((r) => {
            const key = `${r.group}/${r.resource}`
            const bindings = [
              ...new Set(VERBS.map((v) => r.verbs[v]?.binding).filter((b): b is string => !!b)),
            ]
            return (
              <tr key={key}>
                <td className="py-2 pr-3 font-mono text-zinc-200">{key}</td>
                {VERBS.map((v) => {
                  const c = r.verbs[v]
                  const restricted = c?.resourceNames && c.resourceNames.length > 0
                  return c?.allowed ? (
                    <td
                      key={v}
                      className={`px-1.5 py-2 text-center ${restricted ? 'text-amber-400' : 'text-emerald-400'}`}
                      title={
                        restricted ? `restricted to: ${c.resourceNames!.join(', ')}` : c.binding
                      }
                      aria-label={restricted ? `${v} allowed (restricted)` : `${v} allowed`}
                    >
                      ✓
                    </td>
                  ) : (
                    <td
                      key={v}
                      className="px-1.5 py-2 text-center text-zinc-600"
                      aria-label={`${v} denied`}
                    >
                      ✗
                    </td>
                  )
                })}
                {showBindings && (
                  <td className="py-2 pl-3 font-mono text-zinc-400">{bindings.join(', ')}</td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="mt-2 text-[11px] text-zinc-500">
        <span className="text-amber-400">✓</span> = restricted to named resources
      </p>
    </div>
  )
}
