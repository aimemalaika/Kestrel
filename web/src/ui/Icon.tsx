import type { ReactElement } from 'react'

const ICON_PATHS: Record<string, ReactElement> = {
  grid: (
    <>
      <rect x="1" y="1" width="6" height="6" rx="1" />
      <rect x="9" y="1" width="6" height="6" rx="1" />
      <rect x="1" y="9" width="6" height="6" rx="1" />
      <rect x="9" y="9" width="6" height="6" rx="1" />
    </>
  ),
  folder: (
    <>
      <path d="M2 4h4l2 2h6a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" />
    </>
  ),
  pod: (
    <>
      <ellipse cx="8" cy="8" rx="6" ry="4" opacity="0.25" />
      <circle cx="8" cy="8" r="2.5" />
    </>
  ),
  deploy: (
    <>
      <rect x="2" y="6" width="5" height="8" rx="1" />
      <rect x="9" y="2" width="5" height="12" rx="1" />
    </>
  ),
  stateful: (
    <>
      <ellipse cx="8" cy="4" rx="5" ry="2" />
      <path d="M3 4v4a5 2 0 0 0 10 0V4" />
      <path d="M3 8v4a5 2 0 0 0 10 0V8" />
    </>
  ),
  daemon: (
    <>
      <circle cx="4" cy="8" r="2" />
      <circle cx="8" cy="8" r="2" />
      <circle cx="12" cy="8" r="2" />
    </>
  ),
  job: (
    <>
      <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <polyline points="5,8 7,10 11,6" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </>
  ),
  cron: (
    <>
      <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <polyline points="8,4 8,8 11,10" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </>
  ),
  service: (
    <>
      <rect x="1" y="5" width="4" height="3" rx="0.5" />
      <rect x="6" y="2" width="4" height="3" rx="0.5" />
      <rect x="6" y="8" width="4" height="3" rx="0.5" />
      <rect x="11" y="5" width="4" height="3" rx="0.5" />
      <line x1="5" y1="6.5" x2="6" y2="3.5" stroke="currentColor" strokeWidth="1" />
      <line x1="5" y1="6.5" x2="6" y2="9.5" stroke="currentColor" strokeWidth="1" />
      <line x1="10" y1="3.5" x2="11" y2="6.5" stroke="currentColor" strokeWidth="1" />
      <line x1="10" y1="9.5" x2="11" y2="6.5" stroke="currentColor" strokeWidth="1" />
    </>
  ),
  route: (
    <>
      <path d="M2 14 Q8 2 14 8" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <polyline points="11,6 14,8 12,11" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </>
  ),
  ingress: (
    <>
      <rect
        x="2"
        y="2"
        width="12"
        height="12"
        rx="2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <line x1="8" y1="5" x2="8" y2="11" stroke="currentColor" strokeWidth="1.5" />
      <polyline points="5,8 8,11 11,8" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </>
  ),
  shield: (
    <>
      <path
        d="M8 2 L14 4.5 V9 C14 12.5 11 15 8 16 C5 15 2 12.5 2 9 V4.5 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </>
  ),
  storage: (
    <>
      <ellipse cx="8" cy="5" rx="5" ry="2" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3 5v6a5 2 0 0 0 10 0V5" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </>
  ),
  snapshot: (
    <>
      <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="8" cy="8" r="2.5" />
      <line x1="8" y1="2" x2="8" y2="5.5" stroke="currentColor" strokeWidth="1.5" />
    </>
  ),
  build: (
    <>
      <path
        d="M11 2 L14 5 L6 13 L2 14 L3 10 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <line x1="9" y1="4" x2="12" y2="7" stroke="currentColor" strokeWidth="1.5" />
    </>
  ),
  image: (
    <>
      <rect
        x="2"
        y="3"
        width="12"
        height="10"
        rx="1.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <circle cx="5.5" cy="6.5" r="1.5" />
      <polyline points="2,11 6,7 10,11 13,8" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </>
  ),
  pipeline: (
    <>
      <circle cx="3" cy="8" r="2" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="8" cy="8" r="2" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="13" cy="8" r="2" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <line x1="5" y1="8" x2="6" y2="8" stroke="currentColor" strokeWidth="1.5" />
      <line x1="10" y1="8" x2="11" y2="8" stroke="currentColor" strokeWidth="1.5" />
    </>
  ),
  run: (
    <>
      <polygon points="5,3 13,8 5,13" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </>
  ),
  task: (
    <>
      <rect
        x="3"
        y="2"
        width="10"
        height="12"
        rx="1.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <line x1="6" y1="6" x2="10" y2="6" stroke="currentColor" strokeWidth="1.5" />
      <line x1="6" y1="9" x2="10" y2="9" stroke="currentColor" strokeWidth="1.5" />
    </>
  ),
  chart: (
    <>
      <polyline points="1,12 5,7 9,9 15,3" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <line x1="1" y1="15" x2="15" y2="15" stroke="currentColor" strokeWidth="1.5" />
    </>
  ),
  metrics: (
    <>
      <rect x="1" y="9" width="3" height="6" rx="0.5" />
      <rect x="6" y="5" width="3" height="10" rx="0.5" />
      <rect x="11" y="2" width="3" height="13" rx="0.5" />
    </>
  ),
  alert: (
    <>
      <path d="M8 1.5 L14.5 13.5 H1.5 Z" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <line x1="8" y1="6" x2="8" y2="9" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="8" cy="11.5" r="0.6" fill="currentColor" />
    </>
  ),
  events: (
    <>
      <rect
        x="2"
        y="2"
        width="12"
        height="12"
        rx="2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <line x1="5" y1="7" x2="11" y2="7" stroke="currentColor" strokeWidth="1.5" />
      <line x1="5" y1="4.5" x2="11" y2="4.5" stroke="currentColor" strokeWidth="1.5" />
      <line x1="5" y1="9.5" x2="8" y2="9.5" stroke="currentColor" strokeWidth="1.5" />
    </>
  ),
  node: (
    <>
      <rect
        x="3"
        y="3"
        width="10"
        height="10"
        rx="1.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <circle cx="8" cy="8" r="2" />
    </>
  ),
  machine: (
    <>
      <rect
        x="2"
        y="5"
        width="12"
        height="9"
        rx="1.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path d="M5 5 V3 H11 V5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="8" cy="9.5" r="1.5" />
    </>
  ),
  user: (
    <>
      <circle cx="8" cy="5" r="3" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M2 14 C2 11 4.7 9 8 9 C11.3 9 14 11 14 14"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </>
  ),
  group: (
    <>
      <circle cx="6" cy="6" r="2.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="11" cy="5" r="2" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M1 13.5 C1 11 3.2 9.5 6 9.5 C8.8 9.5 11 11 11 13.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path d="M11 9 C12.5 9 15 10 15 12.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </>
  ),
  sa: (
    <>
      <circle cx="8" cy="5" r="3" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3 13 C3 10.5 5.2 9 8 9" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <polyline points="11,11 13,13 15,9" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </>
  ),
  role: (
    <>
      <path
        d="M8 2 L14 4.5 V9 C14 12.5 11 15 8 16 C5 15 2 12.5 2 9 V4.5 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <polyline points="5.5,8 7.5,10 10.5,6" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </>
  ),
  binding: (
    <>
      <path
        d="M4 8 C4 5.8 5.8 4 8 4 C10.2 4 12 5.8 12 8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <line x1="8" y1="4" x2="8" y2="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M2 11 H14" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M2 11 C2 13.2 4.7 15 8 15 C11.3 15 14 13.2 14 11"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </>
  ),
  ns: (
    <>
      <rect
        x="2"
        y="2"
        width="12"
        height="12"
        rx="1"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <line x1="2" y1="6" x2="14" y2="6" stroke="currentColor" strokeWidth="1" />
      <line x1="2" y1="10" x2="14" y2="10" stroke="currentColor" strokeWidth="1" />
      <line x1="6" y1="2" x2="6" y2="14" stroke="currentColor" strokeWidth="1" />
    </>
  ),
  cluster: (
    <>
      <circle cx="8" cy="4" r="2" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="3" cy="12" r="2" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="13" cy="12" r="2" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <line x1="8" y1="6" x2="4" y2="10" stroke="currentColor" strokeWidth="1.5" />
      <line x1="8" y1="6" x2="12" y2="10" stroke="currentColor" strokeWidth="1.5" />
      <line x1="5" y1="12" x2="11" y2="12" stroke="currentColor" strokeWidth="1.5" />
    </>
  ),
  settings: (
    <>
      <circle cx="8" cy="8" r="2.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M8 1v2M8 13v2M1 8h2M13 8h2M3.1 3.1l1.4 1.4M11.5 11.5l1.4 1.4M11.5 4.5l1.4-1.4M3.1 12.9l1.4-1.4"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </>
  ),
  crd: (
    <>
      <rect
        x="2"
        y="2"
        width="12"
        height="4"
        rx="1"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <rect
        x="2"
        y="10"
        width="12"
        height="4"
        rx="1"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <line x1="8" y1="6" x2="8" y2="10" stroke="currentColor" strokeWidth="1.5" />
    </>
  ),
  api: (
    <>
      <path d="M2 8 L6 4 L10 8 L6 12 Z" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 6 H14 V10 H8" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </>
  ),
  puzzle: (
    <>
      <path
        d="M10 2 H14 V6 C13 6 12 7 12 8 C12 9 13 10 14 10 V14 H10 C10 13 9 12 8 12 C7 12 6 13 6 14 H2 V10 C3 10 4 9 4 8 C4 7 3 6 2 6 V2 H6 C6 3 7 4 8 4 C9 4 10 3 10 2 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </>
  ),
  store: (
    <>
      <path d="M2 3 H14 L13 8 H3 Z" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <rect
        x="2"
        y="8"
        width="12"
        height="6"
        rx="1"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <line x1="6" y1="8" x2="6" y2="14" stroke="currentColor" strokeWidth="1" />
      <line x1="10" y1="8" x2="10" y2="14" stroke="currentColor" strokeWidth="1" />
    </>
  ),
  bell: (
    <>
      <path
        d="M8 1.5 a4 4 0 0 1 4 4 v3 l1.5 2 H2.5 L4 8.5 V5.5 a4 4 0 0 1 4-4z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path d="M6.5 12.5 a1.5 1.5 0 0 0 3 0" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </>
  ),
  search: (
    <>
      <circle cx="6.5" cy="6.5" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <line x1="10" y1="10" x2="14" y2="14" stroke="currentColor" strokeWidth="1.5" />
    </>
  ),
  terminal: (
    <>
      <rect
        x="2"
        y="2"
        width="12"
        height="12"
        rx="2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <polyline points="5,6 8,9 5,12" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <line x1="9" y1="12" x2="12" y2="12" stroke="currentColor" strokeWidth="1.5" />
    </>
  ),
  topology: (
    <>
      <circle cx="8" cy="4" r="2" />
      <circle cx="13" cy="11" r="2" />
      <circle cx="3" cy="11" r="2" />
      <line x1="8" y1="6" x2="3" y2="9" stroke="currentColor" strokeWidth="1.5" />
      <line x1="8" y1="6" x2="13" y2="9" stroke="currentColor" strokeWidth="1.5" />
      <line x1="5" y1="11" x2="11" y2="11" stroke="currentColor" strokeWidth="1.5" />
    </>
  ),
  helm: (
    <>
      <path
        d="M8 2 L14 5 V11 L8 14 L2 11 V5 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <circle cx="8" cy="8" r="2" />
    </>
  ),
  gitops: (
    <>
      <circle cx="5" cy="5" r="2" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="11" cy="11" r="2" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M7 5 C9 5 11 7 11 9" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <polyline points="9,4 11,6 13,4" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </>
  ),
  quota: (
    <>
      <rect
        x="2"
        y="2"
        width="12"
        height="12"
        rx="1.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path d="M5 8 H11 M8 5 V11" stroke="currentColor" strokeWidth="1.5" />
    </>
  ),
  configmap: (
    <>
      <rect
        x="3"
        y="2"
        width="10"
        height="12"
        rx="1.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <line x1="6" y1="6" x2="10" y2="6" stroke="currentColor" strokeWidth="1.5" />
      <line x1="6" y1="9" x2="10" y2="9" stroke="currentColor" strokeWidth="1.5" />
    </>
  ),
  secret: (
    <>
      <rect
        x="5"
        y="8"
        width="6"
        height="6"
        rx="1"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M7 8 V6 A2 2 0 0 1 9 4 A2 2 0 0 1 11 6 V8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <circle cx="8" cy="11" r="1" />
    </>
  ),
  chevron: (
    <>
      <polyline points="6,4 10,8 6,12" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </>
  ),
  chevronL: (
    <>
      <polyline points="10,4 6,8 10,12" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </>
  ),
  chevronD: (
    <>
      <polyline points="4,6 8,10 12,6" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </>
  ),
  refresh: (
    <>
      <path d="M13 6 A6 6 0 0 0 3 9" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <polyline points="13,3 13,6 10,6" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3 10 A6 6 0 0 0 13 10" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </>
  ),
  plus: (
    <>
      <line x1="8" y1="2" x2="8" y2="14" stroke="currentColor" strokeWidth="1.5" />
      <line x1="2" y1="8" x2="14" y2="8" stroke="currentColor" strokeWidth="1.5" />
    </>
  ),
  dots: (
    <>
      <circle cx="4" cy="8" r="1.2" />
      <circle cx="8" cy="8" r="1.2" />
      <circle cx="12" cy="8" r="1.2" />
    </>
  ),
  download: (
    <>
      <line x1="8" y1="2" x2="8" y2="11" stroke="currentColor" strokeWidth="1.5" />
      <polyline points="4,8 8,12 12,8" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <line x1="2" y1="14" x2="14" y2="14" stroke="currentColor" strokeWidth="1.5" />
    </>
  ),
  external: (
    <>
      <path d="M7 3 H3 V13 H13 V9" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <polyline points="10,3 13,3 13,6" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <line x1="8" y1="8" x2="13" y2="3" stroke="currentColor" strokeWidth="1.5" />
    </>
  ),
  close: (
    <>
      <line x1="3" y1="3" x2="13" y2="13" stroke="currentColor" strokeWidth="1.5" />
      <line x1="13" y1="3" x2="3" y2="13" stroke="currentColor" strokeWidth="1.5" />
    </>
  ),
  check: (
    <>
      <polyline points="3,8 6,12 13,4" fill="none" stroke="currentColor" strokeWidth="2" />
    </>
  ),
  copy: (
    <>
      <rect
        x="6"
        y="2"
        width="8"
        height="8"
        rx="1"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path d="M2 6 H4 V14 H12 V12" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </>
  ),
  logs: (
    <>
      <rect
        x="2"
        y="2"
        width="12"
        height="12"
        rx="1.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <line x1="5" y1="5.5" x2="11" y2="5.5" stroke="currentColor" strokeWidth="1.5" />
      <line x1="5" y1="8" x2="11" y2="8" stroke="currentColor" strokeWidth="1.5" />
      <line x1="5" y1="10.5" x2="8" y2="10.5" stroke="currentColor" strokeWidth="1.5" />
    </>
  ),
  limit: (
    <>
      <line x1="4" y1="8" x2="12" y2="8" stroke="currentColor" strokeWidth="2" />
      <line x1="4" y1="5" x2="4" y2="11" stroke="currentColor" strokeWidth="1.5" />
      <line x1="12" y1="5" x2="12" y2="11" stroke="currentColor" strokeWidth="1.5" />
    </>
  ),
}

export function Icon({ name, className }: { name: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={className ?? 'w-4 h-4'}
      fill="currentColor"
      aria-hidden="true"
    >
      {ICON_PATHS[name] ?? null}
    </svg>
  )
}

export const ICON_NAMES = Object.keys(ICON_PATHS)
