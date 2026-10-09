import { Outlet } from 'react-router-dom'
import { ResourceTable } from '../table/ResourceTable'
import { useSelection } from '../state/selection'

export function ResourceView() {
  const { gvr } = useSelection()
  // Key by GVR so switching resources in the nav fully remounts the table
  // (fresh stream + reset filters/paging) instead of reusing a stale instance.
  const key = gvr ? `${gvr.group}/${gvr.version}/${gvr.resource}` : 'none'
  return (
    <>
      <ResourceTable key={key} />
      <Outlet />
    </>
  )
}
