import { useAuth } from './AuthProvider'
import { redirectTo } from './redirect'
import { Icon } from '../ui'

export function LoginScreen() {
  const { options } = useAuth()
  return (
    <div className="min-h-screen grid place-items-center bg-page text-zinc-200 px-4">
      <div
        role="group"
        aria-label="Sign in"
        className="flex flex-col gap-3 p-6 w-full max-w-sm bg-surface border border-zinc-800 rounded-lg shadow-2xl"
      >
        <div className="flex items-center gap-2">
          <span className="w-7 h-7 rounded-md bg-brand text-white flex items-center justify-center">
            <Icon name="cluster" className="w-4 h-4" />
          </span>
          <span className="text-xs font-semibold tracking-wide text-zinc-400">KESTREL</span>
        </div>
        <h1 className="m-0 text-lg font-semibold text-zinc-100">Sign in to Kestrel</h1>
        {options.length === 0 ? (
          <p className="m-0 text-xs text-zinc-500">No login methods configured.</p>
        ) : (
          <>
            <p className="m-0 text-xs text-zinc-500">Choose a login method.</p>
            {options.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => o.start && redirectTo(o.start)}
                className="text-left px-3 py-2.5 bg-[#0d1117] hover:bg-zinc-800/70 border border-zinc-700 hover:border-zinc-600 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-red-500/60"
              >
                <div className="text-sm font-semibold text-zinc-100">{o.label}</div>
              </button>
            ))}
          </>
        )}
      </div>
    </div>
  )
}
