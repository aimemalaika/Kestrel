import { useEffect, useRef } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { createClient } from '../client/createClient'
import type { ExecSession, ResourceRef } from '../client/Client'

export function Terminal({ pod }: { pod: ResourceRef }) {
  const hostRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const term = new XTerm({ convertEol: true, fontSize: 13 })
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
  }, [pod.namespace, pod.name, pod.resource])
  return (
    <div ref={hostRef} data-testid="terminal-host" style={{ height: '100%', minHeight: 320 }} />
  )
}
