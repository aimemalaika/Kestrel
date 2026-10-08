import { useEffect, useRef } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { createClient } from '../client/createClient'
import type { ExecSession, ResourceRef } from '../client/Client'

// Mock terminal palette (ui/src/App.tsx TerminalPanel).
const TERM_THEME = {
  background: '#0d1117',
  foreground: '#b0c4de',
  cursor: '#ee6060',
  cursorAccent: '#0d1117',
  selectionBackground: '#3f3f46',
  red: '#ee6060',
  yellow: '#fbbf24',
  brightBlack: '#71717a',
}

export function Terminal({ pod }: { pod: ResourceRef }) {
  const hostRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const term = new XTerm({
      convertEol: true,
      fontSize: 13,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      cursorBlink: true,
      theme: TERM_THEME,
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(host)
    try {
      fit.fit()
    } catch {
      /* jsdom has no layout */
    }
    const session: ExecSession = createClient().exec(pod)
    session.onData((d) => term.write(d))
    const onData = term.onData((d) => session.send(d))
    session.resize(term.cols, term.rows)
    const onResize = term.onResize(({ cols, rows }) => session.resize(cols, rows))
    return () => {
      onData.dispose()
      onResize.dispose()
      session.close()
      term.dispose()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps are pod's primitive fields; avoids resubscribing on a new pod object identity
  }, [pod.namespace, pod.name, pod.resource])
  return (
    <div
      ref={hostRef}
      data-testid="terminal-host"
      className="h-full min-h-80 bg-[#0d1117] p-2 rounded-md border border-zinc-800"
    />
  )
}

export default Terminal
