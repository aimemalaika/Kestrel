import { useState } from 'react'
import { EmptyState, FilterBar, Mono, StatusBadge, Table, TD, TR, ViewHeader } from '../ui'

type Target = {
  endpoint: string
  job: string
  state: 'up' | 'down'
  lastScrape: string
  duration: string
}

// Static sample data; no scrape source is connected.
const TARGETS: Target[] = [
  {
    endpoint: 'http://10.0.1.12:9100/metrics',
    job: 'node-exporter',
    state: 'up',
    lastScrape: '4s ago',
    duration: '12ms',
  },
  {
    endpoint: 'http://10.0.1.13:9100/metrics',
    job: 'node-exporter',
    state: 'up',
    lastScrape: '7s ago',
    duration: '15ms',
  },
  {
    endpoint: 'http://10.0.2.20:8080/metrics',
    job: 'api-server',
    state: 'up',
    lastScrape: '2s ago',
    duration: '31ms',
  },
  {
    endpoint: 'http://10.0.2.21:8080/metrics',
    job: 'api-server',
    state: 'down',
    lastScrape: '1m ago',
    duration: '10.0s',
  },
  {
    endpoint: 'http://10.0.3.5:9090/metrics',
    job: 'scheduler',
    state: 'up',
    lastScrape: '9s ago',
    duration: '8ms',
  },
  {
    endpoint: 'http://10.0.3.8:10250/metrics',
    job: 'kubelet',
    state: 'down',
    lastScrape: '45s ago',
    duration: '5.0s',
  },
]

export function TargetsView() {
  const [query, setQuery] = useState('')
  const [state, setState] = useState('all')
  const q = query.trim().toLowerCase()
  const rows = TARGETS.filter(
    (t) =>
      (state === 'all' || t.state === state) &&
      (!q || `${t.endpoint} ${t.job}`.toLowerCase().includes(q)),
  )
  return (
    <div>
      <ViewHeader title="Targets" count={rows.length} />
      <FilterBar
        query={query}
        onQuery={setQuery}
        statusFilter={state}
        onStatus={setState}
        statuses={['all', 'up', 'down']}
      />
      {rows.length === 0 ? (
        <EmptyState title="No targets match" hint="Adjust the search or state filter" />
      ) : (
        <Table
          aria-label="Scrape targets"
          headers={['Endpoint', 'Job', 'State', 'Last scrape', 'Scrape duration']}
        >
          {rows.map((t) => (
            <TR key={t.endpoint}>
              <TD>
                <Mono>{t.endpoint}</Mono>
              </TD>
              <TD>{t.job}</TD>
              <TD>
                <StatusBadge status={t.state === 'up' ? 'Healthy' : 'Error'} />
              </TD>
              <TD>{t.lastScrape}</TD>
              <TD>{t.duration}</TD>
            </TR>
          ))}
        </Table>
      )}
    </div>
  )
}
