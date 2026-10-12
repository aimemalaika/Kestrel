import { useState } from 'react'
import { useAuth } from './AuthProvider'
import { redirectTo } from './redirect'
import { createClient } from '../client/createClient'
import { Icon } from '../ui'
import type { AuthOption } from './authInfo'
import type { ApiError } from '../contract/types'

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
            {options.map((o) =>
              // The native ROPC form is the only option that submits in-page; a
              // password *connector* (start = /auth/login?connector=…) is a redirect
              // button like GitHub.
              o.id === 'password' && o.start === '/auth/password' ? (
                <PasswordForm key={o.id} />
              ) : (
                <OptionButton key={o.id} option={o} />
              ),
            )}
          </>
        )}
      </div>
    </div>
  )
}

function OptionButton({ option }: { option: AuthOption }) {
  return (
    <button
      type="button"
      onClick={() => option.start && redirectTo(option.start)}
      className="flex items-center gap-2 text-left px-3 py-2.5 bg-[#0d1117] hover:bg-zinc-800/70 border border-zinc-700 hover:border-zinc-600 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-red-500/60"
    >
      <span className="text-sm font-semibold text-zinc-100">{option.label}</span>
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
    <form onSubmit={submit} className="flex flex-col gap-2 pt-1">
      <label className="text-[11px] text-zinc-500" htmlFor="login-username">
        Username
      </label>
      <input
        id="login-username"
        type="text"
        autoComplete="username"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        className="px-3 py-2 text-sm bg-[#0d1117] border border-zinc-700 rounded-md text-zinc-100 focus:outline-none focus:ring-2 focus:ring-red-500/60"
      />
      <label className="text-[11px] text-zinc-500" htmlFor="login-password">
        Password
      </label>
      <input
        id="login-password"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="px-3 py-2 text-sm bg-[#0d1117] border border-zinc-700 rounded-md text-zinc-100 focus:outline-none focus:ring-2 focus:ring-red-500/60"
      />
      {error && (
        <p role="alert" className="text-xs text-red-400">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="mt-1 px-3 py-2 text-sm font-semibold bg-brand text-white rounded-md hover:bg-brand/90 disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-red-500/60"
      >
        {pending ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  )
}
