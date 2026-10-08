import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useResourceObject } from './useResourceObject'
import { DetailPanel } from './DetailPanel'
import { YamlView } from './YamlView'
import { EventsView } from './EventsView'
import { LogViewer } from '../streaming/LogViewer'
import { Terminal } from '../streaming/Terminal'
import { PortForwardButton } from '../sessions/PortForwardButton'
import type { ResourceRef } from '../client/Client'

type Tab = 'detail' | 'yaml' | 'events' | 'logs' | 'terminal'

export function DetailDrawer() {
  const { namespace, group, version, resource, name } = useParams()
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('detail')
  const gvr = group && version && resource ? { group, version, resource } : undefined
  const { object, status } = useResourceObject(gvr, namespace, name)
  const isPod = object?.kind === 'Pod'
  const podRef: ResourceRef | undefined = gvr && name ? { ...gvr, namespace, name } : undefined
  const tabs: Tab[] = isPod
    ? ['detail', 'yaml', 'events', 'logs', 'terminal']
    : ['detail', 'yaml', 'events']

  return (
    <div
      role="dialog"
      aria-label={`${resource ?? ''} ${name ?? ''}`}
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        width: 'min(560px, 90vw)',
        background: 'var(--surface)',
        borderLeft: '1px solid var(--border)',
        boxShadow: 'var(--shadow-card)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 10,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: 'var(--space-4) var(--space-6)',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <strong style={{ color: 'var(--text)' }}>{name}</strong>
        <button
          type="button"
          onClick={() => navigate('..')}
          aria-label="Close"
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--text-muted)',
            fontSize: 18,
          }}
        >
          ×
        </button>
      </div>
      <div
        style={{
          display: 'flex',
          gap: 'var(--space-2)',
          padding: '0 var(--space-6)',
          borderBottom: '1px solid var(--border)',
        }}
      >
        {tabs.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 'var(--space-3) var(--space-2)',
              borderBottom: tab === t ? '2px solid var(--brand-600)' : '2px solid transparent',
              color: tab === t ? 'var(--brand-600)' : 'var(--text-muted)',
              textTransform: 'capitalize',
            }}
          >
            {t}
          </button>
        ))}
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: 'var(--space-6)' }}>
        {status === 'loading' && <p style={{ color: 'var(--text-muted)' }}>Loading…</p>}
        {status === 'notfound' && (
          <p style={{ color: 'var(--text-muted)' }}>{name} no longer exists.</p>
        )}
        {status === 'error' && (
          <p style={{ color: 'var(--text-muted)' }}>Stream interrupted — resyncing…</p>
        )}
        {status === 'ready' && object && (
          <>
            {tab === 'detail' && (
              <>
                <DetailPanel object={object} />
                {isPod && podRef && (
                  <div style={{ marginTop: 'var(--space-4)' }}>
                    <PortForwardButton target={podRef} />
                  </div>
                )}
              </>
            )}
            {tab === 'yaml' && <YamlView object={object} />}
            {tab === 'events' && <EventsView object={object} />}
            {tab === 'logs' && podRef && <LogViewer pod={podRef} />}
            {tab === 'terminal' && podRef && <Terminal pod={podRef} />}
          </>
        )}
      </div>
    </div>
  )
}
