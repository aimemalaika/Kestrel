// Seeded communication edges between workloads. Ids are `<namespace>/<name>`.
export interface WorkloadEdge {
  from: string
  to: string
}

export const TOPOLOGY_EDGES: WorkloadEdge[] = [
  { from: 'production/api-gateway', to: 'production/frontend-deploy' },
  { from: 'production/api-gateway', to: 'production/auth-service' },
  { from: 'production/api-gateway', to: 'production/postgres' },
  { from: 'production/api-gateway', to: 'staging/redis-cache' },
  { from: 'production/api-gateway', to: 'staging/ml-pipeline' },
  { from: 'production/frontend-deploy', to: 'staging/redis-cache' },
  { from: 'production/auth-service', to: 'production/postgres' },
  { from: 'staging/redis-cache', to: 'monitoring/prometheus' },
]
