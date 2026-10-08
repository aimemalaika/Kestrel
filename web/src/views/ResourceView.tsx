import { Outlet } from 'react-router-dom'
import { ResourceTable } from '../table/ResourceTable'

export function ResourceView() {
  return (
    <>
      <ResourceTable />
      <Outlet />
    </>
  )
}
