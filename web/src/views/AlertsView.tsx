import { useState } from 'react'
import {
  Card,
  EmptyState,
  FilterBar,
  Icon,
  Mono,
  PrimaryBtn,
  SecondaryBtn,
  SeverityBadge,
  StatusBadge,
  Table,
  TD,
  TR,
  ViewHeader,
} from '../ui'
import { ALERTS, ALERT_RULES } from '../modules/alerts/alertsMock'

const TABS = ['Alerts', 'Silences', 'Alert Rules']

const BORDER: Record<string, string> = {
  critical: 'border-red-500/30',
  warning: 'border-amber-500/25',
}
const ICON_BG: Record<string, string> = {
  critical: 'bg-red-500/15',
  warning: 'bg-amber-500/15',
  info: 'bg-sky-500/15',
}
const ICON_FG: Record<string, string> = {
  critical: 'text-red-400',
  warning: 'text-amber-400',
  info: 'text-sky-400',
}

export function AlertsView() {
  const [tab, setTab] = useState('Alerts')
  const [sev, setSev] = useState('All')
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const filtered = ALERTS.filter(
    (a) =>
      (sev === 'All' || a.severity === sev) &&
      (!q || `${a.name} ${a.message} ${a.component}`.toLowerCase().includes(q)),
  )
  return (
    <div>
      <ViewHeader title="Monitoring" tabs={TABS} activeTab={tab} onTab={setTab} />
      {tab === 'Alerts' && (
        <>
          <FilterBar
            query={query}
            onQuery={setQuery}
            statusFilter={sev}
            onStatus={setSev}
            statuses={['All', 'critical', 'warning', 'info']}
          />
          {filtered.length === 0 ? (
            <EmptyState title="No alerts match" hint="Adjust the severity filter or search" />
          ) : (
            <div className="space-y-3" data-testid="alert-list">
              {filtered.map((a) => (
                <Card key={a.id} className={`p-4 ${BORDER[a.severity] ?? ''}`}>
                  <div className="flex items-start gap-3">
                    <div
                      className={`mt-0.5 w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${ICON_BG[a.severity]}`}
                    >
                      <Icon name="alert" className={`w-4 h-4 ${ICON_FG[a.severity]}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-sm font-semibold text-zinc-200">{a.name}</span>
                        <SeverityBadge sev={a.severity} />
                        <StatusBadge status={a.state} />
                      </div>
                      <p className="text-xs text-zinc-400 mb-2">{a.message}</p>
                      <div className="flex gap-4 flex-wrap text-[10px] text-zinc-500">
                        <span>
                          namespace: <span className="text-zinc-400">{a.namespace}</span>
                        </span>
                        <span>
                          component: <span className="text-zinc-400">{a.component}</span>
                        </span>
                        <span>
                          for: <span className="text-zinc-400">{a.age}</span>
                        </span>
                      </div>
                      {a.runbook && (
                        <a
                          href={a.runbook}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1 inline-flex items-center gap-1 text-[10px] text-sky-400 hover:underline"
                        >
                          <Icon name="external" className="w-3 h-3" /> Runbook
                        </a>
                      )}
                    </div>
                    <div className="flex flex-col gap-1 shrink-0 items-end">
                      <SecondaryBtn>Silence</SecondaryBtn>
                      <button
                        type="button"
                        onClick={() => setTab('Alert Rules')}
                        className="text-xs text-zinc-500 hover:text-zinc-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60 rounded"
                      >
                        View Rule
                      </button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
      {tab === 'Silences' && (
        <EmptyState
          icon="bell"
          title="No active silences"
          hint="Silenced alerts will appear here"
          action={<PrimaryBtn>Create Silence</PrimaryBtn>}
        />
      )}
      {tab === 'Alert Rules' && (
        <Table
          aria-label="Alert rules"
          headers={['Name', 'Severity', 'State', 'Duration', 'Source']}
        >
          {ALERT_RULES.map((r) => (
            <TR key={r.name}>
              <TD>
                <Mono>{r.name}</Mono>
              </TD>
              <TD>
                <SeverityBadge sev={r.severity} />
              </TD>
              <TD>
                <StatusBadge status={r.state} />
              </TD>
              <TD>
                <span className="text-xs text-zinc-400">{r.duration}</span>
              </TD>
              <TD>
                <span className="text-xs text-zinc-500">{r.source}</span>
              </TD>
            </TR>
          ))}
        </Table>
      )}
    </div>
  )
}
