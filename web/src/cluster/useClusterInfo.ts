import { useEffect, useState } from 'react'
import { createClient } from '../client/createClient'
import type { ClusterInfo } from '../client/Client'

/** Reads GET /api/cluster-info once on mount. `error` is true if the fetch fails
 *  (the UI falls back to the product name / hides the version rather than faking). */
export function useClusterInfo(): { info: ClusterInfo | undefined; error: boolean } {
  const [info, setInfo] = useState<ClusterInfo | undefined>(undefined)
  const [error, setError] = useState(false)

  useEffect(() => {
    let live = true
    createClient()
      .clusterInfo()
      .then((i) => {
        if (live) setInfo(i)
      })
      .catch(() => {
        if (live) setError(true)
      })
    return () => {
      live = false
    }
  }, [])

  return { info, error }
}
