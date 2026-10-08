export type Perspective = 'admin' | 'developer'

// Where a nav item goes. `route` = dedicated page, `resource` = generic resource
// list (namespace-aware, gated on the live catalog), absent = not implemented.
export type NavTarget = { route: string } | { resource: string } | undefined

export interface NavItem {
  label: string
  icon: string
  target?: NavTarget
}

export interface NavSection {
  section: string
  items: NavItem[]
}

const route = (to: string): NavTarget => ({ route: to })
const res = (resource: string): NavTarget => ({ resource })

// Mirrors the design mock's ADMIN_NAV. Edit this data to change the menu.
export const ADMIN_NAV: NavSection[] = [
  {
    section: 'Home',
    items: [
      { label: 'Overview', icon: 'grid', target: route('/overview') },
      { label: 'Projects', icon: 'folder', target: route('/projects') },
    ],
  },
  {
    section: 'Operators',
    items: [
      { label: 'Installed Operators', icon: 'puzzle', target: route('/operators') },
      { label: 'OperatorHub', icon: 'store', target: route('/operatorhub') },
      { label: 'GitOps', icon: 'gitops', target: route('/argo') },
    ],
  },
  {
    section: 'Workloads',
    items: [
      { label: 'Pods', icon: 'pod', target: res('pods') },
      { label: 'Deployments', icon: 'deploy', target: res('deployments') },
      { label: 'StatefulSets', icon: 'stateful', target: res('statefulsets') },
      { label: 'DaemonSets', icon: 'daemon', target: res('daemonsets') },
      { label: 'Jobs', icon: 'job', target: res('jobs') },
      { label: 'CronJobs', icon: 'cron', target: res('cronjobs') },
    ],
  },
  {
    section: 'Networking',
    items: [
      { label: 'Services', icon: 'service', target: res('services') },
      { label: 'Routes', icon: 'route', target: res('routes') },
      { label: 'Ingresses', icon: 'ingress', target: res('ingresses') },
      { label: 'NetworkPolicies', icon: 'shield', target: res('networkpolicies') },
    ],
  },
  {
    section: 'Storage',
    items: [
      { label: 'PersistentVolumes', icon: 'storage', target: res('persistentvolumes') },
      { label: 'PersistentVolumeClaims', icon: 'storage', target: res('persistentvolumeclaims') },
      { label: 'StorageClasses', icon: 'storage', target: res('storageclasses') },
      { label: 'VolumeSnapshots', icon: 'snapshot', target: res('volumesnapshots') },
    ],
  },
  {
    section: 'Builds',
    items: [
      { label: 'Builds', icon: 'build', target: route('/builds') },
      { label: 'BuildConfigs', icon: 'build', target: res('buildconfigs') },
      { label: 'ImageStreams', icon: 'image', target: res('imagestreams') },
      // Not in the mock; kept so the existing Registry page stays reachable.
      { label: 'Registry', icon: 'image', target: route('/registry') },
    ],
  },
  {
    section: 'Pipelines',
    items: [
      { label: 'Pipelines', icon: 'pipeline', target: route('/pipelines') },
      { label: 'PipelineRuns', icon: 'run', target: res('pipelineruns') },
      { label: 'Tasks', icon: 'task', target: res('tasks') },
      { label: 'TaskRuns', icon: 'run', target: res('taskruns') },
    ],
  },
  {
    section: 'Observe',
    items: [
      { label: 'Dashboards', icon: 'chart', target: route('/dashboards') },
      { label: 'Metrics', icon: 'metrics', target: route('/metrics') },
      { label: 'Alerts', icon: 'alert', target: route('/alerts') },
      { label: 'Events', icon: 'events', target: route('/events') },
      { label: 'Targets', icon: 'metrics', target: route('/targets') },
      { label: 'Service Map', icon: 'topology', target: route('/servicemap') },
    ],
  },
  {
    section: 'Compute',
    items: [
      { label: 'Nodes', icon: 'node', target: route('/nodes') },
      { label: 'MachineSets', icon: 'machine', target: res('machinesets') },
      { label: 'Machines', icon: 'machine', target: res('machines') },
    ],
  },
  {
    section: 'User Management',
    items: [
      { label: 'Users', icon: 'user', target: res('users') },
      { label: 'Groups', icon: 'group', target: res('groups') },
      { label: 'Service Accounts', icon: 'sa', target: res('serviceaccounts') },
      { label: 'Roles', icon: 'role', target: res('roles') },
      { label: 'Role Bindings', icon: 'binding', target: res('rolebindings') },
    ],
  },
  {
    section: 'Administration',
    items: [
      { label: 'Namespaces', icon: 'ns', target: res('namespaces') },
      { label: 'ResourceQuotas', icon: 'quota', target: route('/quotas') },
      { label: 'LimitRanges', icon: 'limit', target: res('limitranges') },
      { label: 'ConfigMaps', icon: 'configmap', target: res('configmaps') },
      { label: 'Secrets', icon: 'secret', target: res('secrets') },
      { label: 'Cluster Operators', icon: 'cluster', target: route('/cluster') },
      { label: 'Cluster Settings', icon: 'settings', target: route('/cluster/settings') },
      { label: 'CRDs', icon: 'crd', target: res('customresourcedefinitions') },
      { label: 'API Explorer', icon: 'api', target: route('/api-explorer') },
    ],
  },
]

// Mirrors the design mock's DEV_NAV.
export const DEV_NAV: NavSection[] = [
  {
    section: 'Developer',
    items: [
      { label: 'Topology', icon: 'topology', target: route('/topology') },
      { label: 'Helm Releases', icon: 'helm', target: route('/helm') },
      { label: 'GitOps', icon: 'gitops', target: route('/argo') },
    ],
  },
  {
    section: 'Builds',
    items: [
      { label: 'Builds', icon: 'build', target: route('/builds') },
      { label: 'BuildConfigs', icon: 'build', target: res('buildconfigs') },
      { label: 'Pipelines', icon: 'pipeline', target: route('/pipelines') },
      // Not in the mock; kept so the existing Registry page stays reachable.
      { label: 'Registry', icon: 'image', target: route('/registry') },
    ],
  },
  {
    section: 'Workloads',
    items: [
      { label: 'Pods', icon: 'pod', target: res('pods') },
      { label: 'Deployments', icon: 'deploy', target: res('deployments') },
    ],
  },
  {
    section: 'Networking',
    items: [
      { label: 'Services', icon: 'service', target: res('services') },
      { label: 'Routes', icon: 'route', target: res('routes') },
    ],
  },
  {
    section: 'Observe',
    items: [
      { label: 'Metrics', icon: 'metrics', target: route('/metrics') },
      { label: 'Alerts', icon: 'alert', target: route('/alerts') },
      { label: 'Events', icon: 'events', target: route('/events') },
    ],
  },
  {
    section: 'Configuration',
    items: [
      { label: 'ConfigMaps', icon: 'configmap', target: res('configmaps') },
      { label: 'Secrets', icon: 'secret', target: res('secrets') },
    ],
  },
]

export function navFor(p: Perspective): NavSection[] {
  return p === 'developer' ? DEV_NAV : ADMIN_NAV
}
