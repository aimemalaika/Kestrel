import { Link } from 'react-router-dom'
import { Card } from '../ui'
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
  const cls = current ? 'text-zinc-100 font-semibold' : 'text-brand-fg hover:underline'
  return (
    <li className="list-none py-1 text-xs">
      {href && !current ? (
        <Link to={href} className={cls}>
          {label}
        </Link>
      ) : (
        <span className={current ? cls : 'text-zinc-300'}>{label}</span>
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

  const H = ({ children }: { children: React.ReactNode }) => (
    <h4 className="m-0 mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-400">
      {children}
    </h4>
  )
  return (
    <Card className="p-4 text-zinc-200">
      <H>Owners</H>
      {owners.length === 0 ? (
        <p className="m-0 mb-2 text-xs text-zinc-500">No owners</p>
      ) : (
        <ul className="m-0 mb-2 p-0">
          {owners.map((o) => (
            <Node
              key={o.uid}
              label={`${o.kind}/${o.name}`}
              href={hrefFor(KIND_GVR[o.kind], ns, o.name)}
            />
          ))}
        </ul>
      )}
      <ul className="my-2 p-0 border-l-2 border-brand/40 pl-3">
        <Node label={`${object.kind}/${object.metadata.name}`} current />
      </ul>
      <H>Children</H>
      {children.length === 0 ? (
        <p className="m-0 text-xs text-zinc-500">No children</p>
      ) : (
        <ul className="m-0 p-0 pl-4">
          {children.map((c) => (
            <Node
              key={c.metadata.uid ?? c.metadata.name}
              label={`${c.kind}/${c.metadata.name}`}
              href={hrefFor(childGvr, c.metadata.namespace ?? ns, c.metadata.name)}
            />
          ))}
        </ul>
      )}
    </Card>
  )
}
