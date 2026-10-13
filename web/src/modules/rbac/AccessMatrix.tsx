import type { K8sObject } from '../../contract/types'
import { SubjectMatrix } from './SubjectMatrix'
import type { RBACClient } from './RBACClient'

export function AccessMatrix({ object, client }: { object: K8sObject; client?: RBACClient }) {
  return (
    <SubjectMatrix
      subject={{
        kind: 'ServiceAccount',
        namespace: object.metadata.namespace ?? '',
        name: object.metadata.name,
      }}
      client={client}
    />
  )
}
