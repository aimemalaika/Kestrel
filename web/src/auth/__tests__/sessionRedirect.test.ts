import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  LOGIN_PATH,
  maybeRedirectUnauthorized,
  redirectToLogin,
  __resetSessionRedirect,
} from '../sessionRedirect'

describe('sessionRedirect', () => {
  let assign: ReturnType<typeof vi.fn>

  beforeEach(() => {
    __resetSessionRedirect()
    assign = vi.fn()
    vi.stubGlobal('location', { assign })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('redirects to the login path on 401', () => {
    expect(maybeRedirectUnauthorized({ status: 401 } as Response)).toBe(true)
    expect(assign).toHaveBeenCalledWith(LOGIN_PATH)
  })

  it('does nothing for non-401 statuses', () => {
    expect(maybeRedirectUnauthorized({ status: 403 } as Response)).toBe(false)
    expect(maybeRedirectUnauthorized({ status: 500 } as Response)).toBe(false)
    expect(assign).not.toHaveBeenCalled()
  })

  it('is one-shot: concurrent 401s navigate only once', () => {
    redirectToLogin()
    redirectToLogin()
    redirectToLogin()
    expect(assign).toHaveBeenCalledTimes(1)
  })
})
