// Tiny navigation wrapper so login/logout redirects are mockable in tests.
export function redirectTo(url: string): void {
  globalThis.location?.assign(url)
}
