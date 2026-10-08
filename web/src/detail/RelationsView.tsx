import { Link } from 'react-router-dom'
import type { GVR, K8sObject, OwnerRef } from '../contract/types'
import { useResourceStream } from '../table/useResourceStream'

// Kind -> GVR for the kinds that commonly appear in an ownership chain.
const KIND_GVR: Record<string, GVR> = {
  Pod: { group: '', version: 'v1', resource: 'pods' },
  ReplicaSet: { group: 'apps', version: 'v1', resource: 'replicasets' },
  Deployment: { group: 'apps', version: 'v1', resource: 'deployments' },
  StatefulSet: { group: 'apps', version: 'v1', resource: 'statefulsets' },
  DaemonSet: { group: 'apps', version: 'v1', resource: 'daemonsets' },
  Job: { group: 'batch', version: 'v1', resource: 'jobs' },
  CronJob: { group: 'batch', version: 'v1', resource: 'cronjobs' },
}

// Likely child kind per parent kind (scan only what is cheap to stream).
const CHILD_KIND: Record<string, string> = {
  Deployment: 'ReplicaSet',
  ReplicaSet: 'Pod',
  StatefulSet: 'Pod',
  DaemonSet: 'Pod',
  Job: 'Pod',
  CronJob: 'Job',
}

function hrefFor(gvr: GVR | undefined, namespace: string | undefined, name: string) {
  if (!gvr || !namespace) return undefined
  return `/ns/${encodeURIComponent(namespace)}/${gvr.group || 'core'}/${gvr.version}/${gvr.resource}/${encodeURIComponent(name)}`
}

function Node({ label, href, current }: { label: string; href?: string; current?: boolean }) {
  const style = {
    color: current ? 'var(--text)' : 'var(--accent)',
    fontWeight: current ? 600 : 400,
  }
  return (
    <li style={{ listStyle: 'none', padding: 'var(--space-1) 0' }}>
      {href && !current ? (
        <Link to={href} style={style}>
          {label}
        </Link>
      ) : (
        <span style={style}>{label}</span>
      )}
    </li>
  )
}

export function RelationsView({ object }: { object: K8sObject }) {
  const ns = object.metadata.namespace
  const uid = object.metadata.uid
  const childKind = CHILD_KIND[object.kind]
  const childGvr = childKind ? KIND_GVR[childKind] : undefined
  const { rows } = useResourceStream(childGvr, ns)
  const owners: OwnerRef[] = object.metadata.ownerReferences ?? []
  const children = uid
    ? rows.filter((r) => r.metadata.ownerReferences?.some((o) => o.uid === uid))
    : []

  return (
    <div style={{ padding: 'var(--space-4)', color: 'var(--text)' }}>
      <h4 style={{ margin: 0, color: 'var(--text-muted)' }}>Owners</h4>
      {owners.length === 0 ? (
        <p style={{ color: 'var(--text-muted)' }}>No owners</p>
      ) : (
        <ul style={{ margin: 0, padding: 0 }}>
          {owners.map((o) => (
            <Node
              key={o.uid}
              label={`${o.kind}/${o.name}`}
              href={hrefFor(KIND_GVR[o.kind], ns, o.name)}
            />
          ))}
        </ul>
      )}
      <ul style={{ margin: 'var(--space-2) 0', padding: 0 }}>
        <Node label={`${object.kind}/${object.metadata.name}`} current />
      </ul>
      <h4 style={{ margin: 0, color: 'var(--text-muted)' }}>Children</h4>
      {children.length === 0 ? (
        <p style={{ color: 'var(--text-muted)' }}>No children</p>
      ) : (
        <ul style={{ margin: 0, paddingLeft: 'var(--space-4)' }}>
          {children.map((c) => (
            <Node
              key={c.metadata.uid ?? c.metadata.name}
              label={`${c.kind}/${c.metadata.name}`}
              href={hrefFor(childGvr, c.metadata.namespace ?? ns, c.metadata.name)}
            />
          ))}
        </ul>
      )}
    </div>
  )
}
