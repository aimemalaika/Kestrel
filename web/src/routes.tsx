import { Routes, Route } from 'react-router-dom'
import { AppShell } from './shell/AppShell'
import { ResourceView } from './views/ResourceView'
import { EmptyState } from './views/EmptyState'
import { DetailDrawer } from './detail/DetailDrawer'
import { RegistryBrowser } from './modules/registry/RegistryBrowser'
import { HelmBrowser } from './modules/helm/HelmBrowser'
import { ArgoRichView } from './modules/argo/ArgoRichView'
import { Overview } from './views/Overview'
import { NodesView } from './views/NodesView'
import { EventsView } from './views/EventsView'
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
        <Route path="overview" element={<Overview />} />
        <Route path="nodes" element={<NodesView />} />
        <Route path="events" element={<EventsView />} />
        <Route path="helm" element={<HelmBrowser />} />
        <Route path="argo" element={<ArgoRichView />} />
        <Route path="debug" element={<StreamDebugView />} />
        <Route path="*" element={<EmptyState />} />
      </Route>
    </Routes>
  )
}
