// Centralized handling for a 401 from the backend: an expired or absent OIDC
// session (when auth is enabled) means the browser must restart the login flow.
// We send it to the backend login route (`/auth/login`), which redirects to the
// OIDC provider. In single-operator mode (OIDC disabled) the API never returns
// 401, so this never fires spuriously.
//
// It is one-shot (concurrent 401s from parallel requests must not thrash
// navigation) and a no-op in non-browser / test environments (no location, or
// a location whose assign has been stubbed is called exactly once).
export const LOGIN_PATH = '/auth/login'

let redirecting = false

export function redirectToLogin(): void {
  if (redirecting) return
  const loc = globalThis.location
  if (!loc || typeof loc.assign !== 'function') return
  redirecting = true
  loc.assign(LOGIN_PATH)
}

// maybeRedirectUnauthorized triggers the login redirect when a response is a
// 401, and returns whether it did — so callers can branch if needed.
export function maybeRedirectUnauthorized(res: Response): boolean {
  if (res.status === 401) {
    redirectToLogin()
    return true
  }
  return false
}

// Test hook: reset the one-shot guard between tests.
export function __resetSessionRedirect(): void {
  redirecting = false
}
