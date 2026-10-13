import type { Perspective } from '../nav/categoryMap'

// UI gating only: whether to offer the Administrator perspective. RBAC on the
// apiserver remains the real security boundary.
export function canAdmin(
  mode: string,
  groups: string[] | undefined,
  adminGroups: string[] | undefined,
): boolean {
  if (mode === 'single-operator') return true
  if (!adminGroups?.length) return true
  return (groups ?? []).some((g) => adminGroups.includes(g))
}

export function allowedPerspective(stored: Perspective, canAdminPerspective: boolean): Perspective {
  return canAdminPerspective ? stored : 'developer'
}
