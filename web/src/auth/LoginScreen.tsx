import { useState } from 'react'
import { useAuth } from './AuthProvider'
import { redirectTo } from './redirect'
import { createClient } from '../client/createClient'
import { Icon } from '../ui'
import type { AuthOption } from './authInfo'
import type { ApiError } from '../contract/types'

export function LoginScreen() {
  const { options } = useAuth()
  // The native ROPC form submits in-page; everything else (GitHub, a password
  // *connector*) is a redirect button.
  const nativePassword = options.find((o) => o.id === 'password' && o.start === '/auth/password')
  const buttonOptions = options.filter((o) => o !== nativePassword)

  return (
    <div className="min-h-screen grid place-items-center bg-page text-zinc-200 px-4">
      <div
        role="group"
        aria-label="Sign in"
        className="flex flex-col gap-4 p-7 w-full max-w-sm bg-surface border border-zinc-800 rounded-xl shadow-2xl"
      >
        <div className="flex items-center gap-2">
          <span className="w-8 h-8 rounded-md bg-brand text-white flex items-center justify-center">
            <Icon name="cluster" className="w-4 h-4" />
          </span>
          <span className="text-xs font-semibold tracking-widest text-zinc-400">KESTREL</span>
        </div>
        <div>
          <h1 className="m-0 text-xl font-semibold text-zinc-100">Sign in to Kestrel</h1>
          {options.length === 0 ? (
            <p className="mt-1 mb-0 text-xs text-zinc-500">No login methods configured.</p>
          ) : (
            <p className="mt-1 mb-0 text-xs text-zinc-500">Choose how you want to sign in.</p>
          )}
        </div>

        {buttonOptions.length > 0 && (
          <div className="flex flex-col gap-2">
            {buttonOptions.map((o) => (
              <OptionButton key={o.id} option={o} />
            ))}
          </div>
        )}

        {buttonOptions.length > 0 && nativePassword && (
          <div className="flex items-center gap-3" aria-hidden="true">
            <span className="h-px flex-1 bg-zinc-800" />
            <span className="text-[10px] uppercase tracking-widest text-zinc-600">or</span>
            <span className="h-px flex-1 bg-zinc-800" />
          </div>
        )}

        {nativePassword && <PasswordForm />}
      </div>
    </div>
  )
}

function OptionButton({ option }: { option: AuthOption }) {
  const click = () => option.start && redirectTo(option.start)
  if (option.id === 'github') {
    return (
      <button
        type="button"
        onClick={click}
        className="flex items-center justify-center gap-2.5 px-3 py-2.5 bg-[#24292f] hover:bg-[#30363d] border border-zinc-700 rounded-md text-white text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/60"
      >
        <GitHubMark className="w-4.5 h-4.5 shrink-0" />
        {option.label}
      </button>
    )
  }
  return (
    <button
      type="button"
      onClick={click}
      className="flex items-center justify-center gap-2.5 px-3 py-2.5 bg-[#0d1117] hover:bg-zinc-800/70 border border-zinc-700 hover:border-zinc-600 rounded-md text-sm font-semibold text-zinc-100 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/60"
    >
      <Icon name="shield" className="w-4 h-4 shrink-0 text-zinc-400" />
      {option.label}
    </button>
  )
}

function PasswordForm() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setPending(true)
    try {
      await createClient().passwordLogin(username, password)
      // Re-drive auth: a fresh /authinfo fetch now reports the authenticated user.
      globalThis.location?.reload?.()
    } catch (err) {
      setError((err as ApiError)?.error || 'Sign in failed')
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1.5">
        <span className="text-[11px] font-medium text-zinc-400">Username</span>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600">
            <Icon name="user" className="w-4 h-4" />
          </span>
          <input
            id="login-username"
            type="text"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full pl-9 pr-3 py-2.5 text-sm bg-[#0d1117] border border-zinc-700 rounded-md text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-brand/60"
          />
        </div>
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-[11px] font-medium text-zinc-400">Password</span>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600">
            <LockMark className="w-4 h-4" />
          </span>
          <input
            id="login-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full pl-9 pr-3 py-2.5 text-sm bg-[#0d1117] border border-zinc-700 rounded-md text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-brand/60"
          />
        </div>
      </label>
      {error && (
        <p role="alert" className="m-0 text-xs text-red-400">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="mt-1 flex items-center justify-center gap-2 px-3 py-2.5 text-sm font-semibold bg-brand text-white rounded-md hover:bg-brand/90 disabled:opacity-60 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/60"
      >
        {pending ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  )
}

function GitHubMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="16"
      height="16"
      aria-hidden="true"
      className={className}
      fill="currentColor"
    >
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.65 7.65 0 012-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  )
}

function LockMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="24"
      height="24"
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0110 0v4" />
    </svg>
  )
}
