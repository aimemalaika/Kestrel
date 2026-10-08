import { useEffect, useRef, useState } from 'react'
import { createClient } from '../client/createClient'
import type { ExecSession, ResourceRef } from '../client/Client'

export function useExecSession(pod: ResourceRef): {
  data: string[]
  send: (d: string) => void
  resize: (c: number, r: number) => void
} {
  const [data, setData] = useState<string[]>([])
  const sessionRef = useRef<ExecSession | null>(null)
  useEffect(() => {
    setData([])
    const s = createClient().exec(pod)
    sessionRef.current = s
    s.onData((d) => setData((prev) => [...prev, d]))
    return () => {
      s.close()
      sessionRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps are pod's primitive fields; avoids resubscribing on a new pod object identity
  }, [pod.namespace, pod.name, pod.resource])
  return {
    data,
    send: (d) => sessionRef.current?.send(d),
    resize: (c, r) => sessionRef.current?.resize(c, r),
  }
}
