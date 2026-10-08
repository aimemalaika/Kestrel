import { Routes, Route } from 'react-router-dom'
import { AppShell } from './shell/AppShell'
import { ResourceView } from './views/ResourceView'
import { EmptyState } from './views/EmptyState'
import { DetailDrawer } from './detail/DetailDrawer'
import { RegistryBrowser } from './modules/registry/RegistryBrowser'
import { StreamDebugView } from './debug/StreamDebugView'

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<AppShell />}>
        <Route index element={<EmptyState />} />
        <Route path="ns/:namespace" element={<EmptyState />} />
        <Route path="ns/:namespace/:group/:version/:resource" element={<ResourceView />}>
          <Route path=":name" element={<DetailDrawer />} />
        </Route>
        <Route path="registry" element={<RegistryBrowser />} />
        <Route path="debug" element={<StreamDebugView />} />
        <Route path="*" element={<EmptyState />} />
      </Route>
    </Routes>
  )
}
