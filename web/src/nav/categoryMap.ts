import type { CatalogEntry } from '../contract/types'

export type Section =
  'Workloads' | 'Config' | 'Network' | 'Storage' | 'Access Control' | 'Cluster' | 'Custom Resources'

export const SECTION_ORDER: Section[] = [
  'Workloads',
  'Config',
  'Network',
  'Storage',
  'Access Control',
  'Cluster',
  'Custom Resources',
]

// kind -> section for kinds we classify explicitly. Anything not listed falls
// through to Custom Resources. Grouping is DATA: edit this map only.
const KIND_SECTION: Record<string, Section> = {
  Pod: 'Workloads',
  Deployment: 'Workloads',
  ReplicaSet: 'Workloads',
  StatefulSet: 'Workloads',
  DaemonSet: 'Workloads',
  Job: 'Workloads',
  CronJob: 'Workloads',
  ConfigMap: 'Config',
  Secret: 'Config',
  Service: 'Network',
  Ingress: 'Network',
  NetworkPolicy: 'Network',
  PersistentVolumeClaim: 'Storage',
  PersistentVolume: 'Storage',
  StorageClass: 'Storage',
  Role: 'Access Control',
  RoleBinding: 'Access Control',
  ClusterRole: 'Access Control',
  ClusterRoleBinding: 'Access Control',
  ServiceAccount: 'Access Control',
  Node: 'Cluster',
  Namespace: 'Cluster',
  Event: 'Cluster',
}

export function sectionFor(entry: Pick<CatalogEntry, 'group' | 'kind'>): Section {
  return KIND_SECTION[entry.kind] ?? 'Custom Resources'
}

export interface SectionBucket {
  section: Section
  items: CatalogEntry[]
}

export function bucketCatalog(entries: CatalogEntry[]): SectionBucket[] {
  const by = new Map<Section, CatalogEntry[]>()
  for (const e of entries) {
    const s = sectionFor(e)
    const list = by.get(s) ?? []
    list.push(e)
    by.set(s, list)
  }
  return SECTION_ORDER.filter((s) => by.has(s)).map((section) => ({
    section,
    items: by.get(section)!,
  }))
}
