export const SAMPLE_YAML = `apiVersion: kestrel.dev/v1
kind: ServiceMap
metadata:
  name: payments-platform
services:
  - id: checkout
    displayName: Checkout API
    slo: 99.9
    workload:
      namespace: shop
      kind: Deployment
      name: checkout
    dependsOn:
      - { id: payments, protocol: http, critical: true }
      - { id: inventory, protocol: grpc, critical: false }
  - id: payments
    slo: 99.95
    workload: { namespace: shop, kind: Deployment, name: payments }
    dependsOn: [ { id: ledger, critical: true } ]
  - id: ledger
    slo: 99.99
    workload: { namespace: shop, kind: StatefulSet, name: ledger }
  - id: inventory
    slo: 99.5
    workload: { namespace: shop, kind: Deployment, name: inventory }
`
