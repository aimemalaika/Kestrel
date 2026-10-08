import type { Change } from 'diff'

export function DiffView({ parts }: { parts: Change[] }) {
  return (
    <pre
      data-testid="diff"
      className="mt-3 text-xs font-mono leading-relaxed overflow-auto bg-[#0d1117] border border-zinc-800 rounded-md p-3"
    >
      {parts.map((p, i) => (
        <div
          key={i}
          className={`whitespace-pre-wrap ${
            p.added
              ? 'text-emerald-300 bg-emerald-500/10'
              : p.removed
                ? 'text-red-300 bg-red-500/10'
                : 'text-zinc-500'
          }`}
        >
          {(p.added ? '+ ' : p.removed ? '- ' : '  ') + p.value.replace(/\n$/, '')}
        </div>
      ))}
    </pre>
  )
}
