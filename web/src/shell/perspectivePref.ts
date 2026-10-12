import type { Perspective } from '../nav/categoryMap'

const KEY = 'kestrel.defaultPerspective'

// The user's default perspective, persisted per-browser. The stored value wins;
// 'admin' is only the cold-start fallback (no hardcoded default in the component).
export function loadDefaultPerspective(): Perspective {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'developer' || v === 'admin' ? v : 'admin'
  } catch {
    return 'admin'
  }
}

export function saveDefaultPerspective(p: Perspective): void {
  try {
    localStorage.setItem(KEY, p)
  } catch {
    /* ignore (private mode / blocked storage) */
  }
}
