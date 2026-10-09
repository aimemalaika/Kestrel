import { useResourceStream } from '../../table/useResourceStream'
import { ViewHeader, EmptyState, Card, PrimaryBtn, Icon } from '../../ui'
import { ArgoAppGrid } from './ArgoRichView'

const GVR = { group: 'argoproj.io', version: 'v1alpha1', resource: 'applications' }

/** The GitOps card grid of Argo Applications (live data via the generic stream). */
export function ArgoApplicationsView() {
  const { rows, status } = useResourceStream(GVR, 'argocd')
  return (
    <div className="p-6">
      <ViewHeader
        title="Applications"
        count={rows.length}
        action={
          <PrimaryBtn>
            <Icon name="plus" className="w-3.5 h-3.5" />
            Create Application
          </PrimaryBtn>
        }
      />
      {status === 'loading' && (
        <Card>
          <EmptyState title="Loading…" icon="refresh" />
        </Card>
      )}
      {status === 'error' && (
        <Card>
          <EmptyState title="Stream interrupted — resyncing…" icon="alert" />
        </Card>
      )}
      {status === 'ready' && rows.length === 0 && (
        <Card>
          <EmptyState title="No applications found." />
        </Card>
      )}
      {status === 'ready' && rows.length > 0 && <ArgoAppGrid objects={rows} />}
    </div>
  )
}
