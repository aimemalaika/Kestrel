# Kestrel Helm chart

Deploys **Kestrel** — a single Go binary that serves an embedded SPA and talks
to the Kubernetes apiserver — as a Deployment with a ServiceAccount, cluster-wide
read RBAC, a Service, and optional Ingress, TLS, Secret, and Prometheus
ServiceMonitor.

```
helm install kestrel deploy/chart/kestrel
```

The image is built from the repo-root `Dockerfile` (multi-stage: Vite SPA →
Go build → distroless/static:nonroot). Build and push it before installing:

```
docker build -t ghcr.io/aimemalaika/kestrel:1.0.0 .
docker push ghcr.io/aimemalaika/kestrel:1.0.0
helm install kestrel deploy/chart/kestrel --set image.tag=1.0.0
```

## Auth model: single-operator vs OIDC

By default **no OIDC issuer is configured** (`config.oidc.issuer` empty). This is
**single-operator mode**: there is NO login, and anyone who can reach the Service
has full operator access using the pod ServiceAccount's cluster-wide read view.
Only run it this way behind strong network controls (e.g. no Ingress, access via
`kubectl port-forward` only).

To require login, set the OIDC block:

```yaml
config:
  oidc:
    issuer: https://issuer.example.com
    clientId: kestrel
    redirectUrl: https://kestrel.example.com/auth/callback
existingSecret:
  name: kestrel-secrets   # must contain oidc-client-secret and session-key
```

> **Hard requirement:** the **kube-apiserver must be configured to trust the SAME
> OIDC issuer**. Kestrel uses **token forwarding** — it forwards each user's own
> OIDC token to the apiserver for per-request authorization. If the apiserver
> doesn't trust the issuer, user requests will be rejected.

## RBAC: broad read is by design

The chart creates a `ClusterRole` granting **`get`, `list`, `watch` on all
resources** (`apiGroups: ["*"]`, `resources: ["*"]`) bound to the SA.

- This is **read-only** — never create/update/delete.
- It **does NOT** grant `impersonate` and **does NOT** grant
  `serviceaccounts/token`. Kestrel needs neither.
- It is deliberately broad (including Secrets) because the **shared informer /
  SSE cache watches the cluster as the ServiceAccount**. Per-user delivery is
  gated by the **per-user SSE read filter** (issue #46), which is what prevents
  cross-user data leakage — not the SA's own permissions.

Set `rbac.clusterRead: false` to withhold the broad grant. Most of Kestrel's
read surface (live catalog, generic tables, SSE streams) will then stop working
unless you bind your own narrower roles to the SA out-of-band.

`automountServiceAccountToken` is **true** on purpose: the SA token is the
in-cluster credential the binary uses for API discovery and the informer cache.

## Secrets

Three sensitive inputs — the OIDC client secret, the session HMAC key, and the
registry password — are injected from a Kubernetes Secret as **environment
variables** and expanded into the corresponding flags via Kubernetes `$(VAR)`
argument expansion. Prefer an existing Secret:

```yaml
existingSecret:
  name: kestrel-secrets
  oidcClientSecretKey: oidc-client-secret
  sessionKeyKey: session-key
  registryPasswordKey: registry-password
```

For quick testing you may let the chart create the Secret from inline values
(`secret.create: true`, `secret.oidcClientSecret`, `secret.sessionKey`,
`secret.registryPassword`) — **not for production**.

> **Hardening follow-up:** the binary currently reads these as **flags**, so even
> when sourced from a Secret via env the value still lands on the process command
> line (visible in `ps` / the running container spec). Making the binary read
> these secrets natively from env is a tracked hardening follow-up. The chart
> keeps the plaintext out of the rendered manifests (it lives only in the Secret
> and the injected env var) — acceptable for 1.0 with the follow-up flagged.

If no session key is provided the binary generates a random one at startup;
sessions then won't survive restarts or work across replicas. Set a stable key
in production.

## TLS and Ingress

Terminate TLS at the Ingress (recommended):

```yaml
ingress:
  enabled: true
  className: nginx
  host: kestrel.example.com
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt
  tls:
    enabled: true
    secretName: kestrel-tls
config:
  trustedProxy: true   # trust X-Forwarded-For from the ingress
```

Or terminate TLS **in the pod** by mounting a `kubernetes.io/tls` Secret:

```yaml
config:
  tls:
    enabled: true
    existingSecret: kestrel-tls   # mounted at /tls; cert/key paths default there
```

## Registry and Helm repos

```yaml
config:
  registry:
    url: https://registry.example.com
    username: robot
    allowDelete: false
    insecureSkipVerify: false   # never true in production
  helmRepos:
    - name: bitnami
      url: https://charts.bitnami.com/bitnami
```

The registry password comes from the Secret (see above). `helmRepos` render to
repeated `--helm-repo name=url` flags.

## Metrics

Kestrel serves Prometheus metrics on a **separate listener** (`:9090`, named
`metrics`). To scrape with the Prometheus Operator:

```yaml
service:
  metrics: true              # expose the metrics port on the Service
metrics:
  serviceMonitor:
    enabled: true
    labels:
      release: prometheus    # match your Prometheus serviceMonitorSelector
```

## Probes

Liveness and readiness probes do an HTTP GET on `/` (which serves the SPA, 200).
There is no dedicated `/healthz` endpoint yet — adding one is a follow-up. Adjust
or disable the probes via `livenessProbe` / `readinessProbe` in values.

## Security context

Secure defaults are applied and should be kept:

- Pod: `runAsNonRoot: true`, `seccompProfile: RuntimeDefault`.
- Container: `allowPrivilegeEscalation: false`, `readOnlyRootFilesystem: true`,
  `capabilities.drop: [ALL]`. A writable `emptyDir` is mounted at `/tmp`.

See `values.yaml` for the full set of options and their defaults.
