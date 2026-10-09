import type { ApiError } from '../contract/types'

// Module clients (registry, helm) talk to the Go backend over same-origin
// fetch so the OIDC session cookie rides along. Unlike the legacy HttpClient,
// these do NOT send Impersonate-* headers — the backend authenticates the
// session and ignores them.

async function toApiError(res: Response): Promise<ApiError> {
  let body: Partial<ApiError> = {}
  try {
    body = (await res.json()) as Partial<ApiError>
  } catch {
    /* non-JSON body */
  }
  return {
    error: body.error ?? res.statusText ?? 'request failed',
    code: body.code ?? res.status,
    reason: body.reason ?? '',
  }
}

export async function getJSON<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  })
  if (!res.ok) throw await toApiError(res)
  return (await res.json()) as T
}

export async function del(url: string): Promise<void> {
  const res = await fetch(url, {
    method: 'DELETE',
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  })
  if (!res.ok) throw await toApiError(res)
}

export const q = encodeURIComponent
