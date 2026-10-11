import type { ApiError } from '../../contract/types'
import { getJSON } from '../moduleFetch'
import { maybeRedirectUnauthorized } from '../../auth/sessionRedirect'
import type { ParseResult, ServiceMapModel, ValidationError } from './types'

// Same-origin client for the B10 service-map backend. GET reuses the shared
// moduleFetch helper (throws the {error,code,reason} contract on !ok). PUT
// needs custom status handling: a 422 body carries the ValidationError[] we
// render, and 400/413 carry a {error} message, so we translate those into a
// ParseResult rather than throwing.

const toApiError = async (res: Response): Promise<ApiError> => {
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

export function getServiceMap(): Promise<ServiceMapModel> {
  return getJSON<ServiceMapModel>('/api/servicemap')
}

export async function putServiceMap(yaml: string): Promise<ParseResult> {
  const res = await fetch('/api/servicemap', {
    method: 'PUT',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/yaml' },
    body: yaml,
  })

  if (res.ok) {
    const model = (await res.json()) as ServiceMapModel
    return { ok: true, model }
  }

  if (res.status === 422) {
    const body = (await res.json()) as { errors?: ValidationError[] }
    return { ok: false, errors: body.errors ?? [] }
  }

  if (res.status === 400) {
    const body = (await res.json()) as Partial<ApiError>
    return { ok: false, errors: [{ message: body.error ?? 'Malformed YAML' }] }
  }

  if (res.status === 413) {
    return { ok: false, errors: [{ message: 'Service map too large (max 1 MiB)' }] }
  }

  maybeRedirectUnauthorized(res)
  throw await toApiError(res)
}
