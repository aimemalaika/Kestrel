import type { K8sObject } from '../../contract/types'
import type { ResultsClient, RunSummary } from './ResultsClient'

const RUNS: RunSummary[] = [
  run(
    'u1',
    'PipelineRun',
    'team-a',
    'build-web-x7k2',
    'Succeeded',
    '2026-10-10T08:00:00Z',
    '2026-10-10T08:06:12Z',
  ),
  run(
    'u2',
    'PipelineRun',
    'team-a',
    'build-api-m3p9',
    'Failed',
    '2026-10-10T09:15:00Z',
    '2026-10-10T09:17:41Z',
  ),
  run(
    'u3',
    'TaskRun',
    'team-b',
    'unit-tests-q8z1',
    'Succeeded',
    '2026-10-11T13:30:00Z',
    '2026-10-11T13:31:05Z',
  ),
  run(
    'u4',
    'TaskRun',
    'team-b',
    'lint-r2d4',
    'Failed',
    '2026-10-11T14:00:00Z',
    '2026-10-11T14:00:22Z',
  ),
  run(
    'u5',
    'PipelineRun',
    'team-b',
    'deploy-prod-k5w6',
    'Succeeded',
    '2026-10-12T16:45:00Z',
    '2026-10-12T16:58:30Z',
  ),
]

function run(
  uid: string,
  kind: RunSummary['kind'],
  namespace: string,
  name: string,
  status: string,
  startTime: string,
  completionTime: string,
): RunSummary {
  return {
    uid,
    kind,
    namespace,
    name,
    status,
    startTime,
    completionTime,
    recordName: `${namespace}/results/${uid}/records/${uid}`,
  }
}

export function createMockResults(): ResultsClient {
  return {
    enabled: true,
    async listRuns(opts) {
      return RUNS.filter(
        (r) =>
          (!opts?.namespace || r.namespace === opts.namespace) &&
          (!opts?.kind || r.kind === opts.kind),
      )
    },
    async getRun(record) {
      const r = RUNS.find((x) => x.recordName === record)
      if (!r) throw { error: 'not found', code: 404, reason: '' }
      return {
        apiVersion: 'tekton.dev/v1',
        kind: r.kind,
        metadata: { name: r.name, namespace: r.namespace, uid: r.uid },
        status: {
          startTime: r.startTime,
          completionTime: r.completionTime,
          conditions: [
            {
              type: 'Succeeded',
              status: r.status === 'Succeeded' ? 'True' : 'False',
              reason: r.status,
            },
          ],
        },
      } as unknown as K8sObject
    },
    async getLog(record) {
      const r = RUNS.find((x) => x.recordName === record)
      return [
        `[fetch-source] Cloning repository for ${r?.name ?? record}`,
        '[fetch-source] checked out main',
        '[build] running build step',
        r?.status === 'Failed'
          ? '[build] error: step exited with code 1'
          : '[build] build complete',
      ].join('\n')
    },
  }
}
