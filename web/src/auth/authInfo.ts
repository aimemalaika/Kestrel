// Shape of the backend's unauthenticated GET /authinfo discovery payload. It
// carries no secrets — only the active auth mode, the current user (when a
// session is present), and the login options the SPA should render.

export type AuthOption = {
  id: string
  label: string
  start?: string
}

export type AuthInfo = {
  mode: 'single-operator' | 'oidc'
  user?: { name: string; groups?: string[] } | null
  options: AuthOption[]
  // Groups allowed the Administrator perspective (the backend's --admin-groups).
  // Empty/absent means no gating. UI gating only; RBAC is the real boundary.
  adminGroups?: string[]
}
