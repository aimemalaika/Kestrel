# Installing Kestrel with Helm

The chart lives at `deploy/chart/kestrel/` in this repo. It deploys Kestrel as a
Deployment with a ServiceAccount, cluster-wide **read** RBAC (get/list/watch
only — no `impersonate`, no `serviceaccounts/token`), a Service, and optional
Ingress, TLS, Secret, and a Prometheus ServiceMonitor.

Two ready-to-edit value files are here:

- [`values-single-operator.yaml`](./values-single-operator.yaml) — minimal,
  in-cluster, **no login**. Everyone who reaches the Service shares the pod
  ServiceAccount's view. Keep it off the network (no Ingress; use
  `kubectl port-forward`).
- [`values-oidc.yaml`](./values-oidc.yaml) — **multi-user login** with per-user
  token forwarding, plus registry, a chart repo, Ingress + TLS, and
  `trustedProxy: true` behind the ingress.

## Build & push the image first

```sh
docker build -t ghcr.io/aimemalaika/kestrel:1.0.0 .
docker push ghcr.io/aimemalaika/kestrel:1.0.0
```

## Install — single-operator

```sh
helm install kestrel ../../deploy/chart/kestrel \
  --set image.tag=1.0.0 \
  -f values-single-operator.yaml

kubectl port-forward svc/kestrel 8080:8080
# open http://localhost:8080
```

## Install — OIDC multi-user

First create the Secret the chart reads (never commit these values):

```sh
kubectl create secret generic kestrel-secrets \
  --from-literal=oidc-client-secret='<oidc client secret>' \
  --from-literal=session-key="$(openssl rand -base64 48)" \
  --from-literal=registry-password='<registry password>'
```

Then install, after editing the issuer/client/host in the values file:

```sh
helm install kestrel ../../deploy/chart/kestrel \
  --set image.tag=1.0.0 \
  -f values-oidc.yaml
```

> **Hard requirement:** the kube-apiserver must trust the **same** OIDC issuer
> you set in `config.oidc.issuer` (a Dex/Keycloak broker). See [`../oidc/`](../oidc/).

### Choosing login methods

The sign-in screen offers exactly the methods you enable (the user picks one).
Set them under `config.oidc` (see `values-oidc.yaml`):

```yaml
config:
  oidc:
    issuer: "https://dex.example.com"   # a Dex/Keycloak broker
    clientId: "kestrel"
    redirectUrl: "https://kestrel.example.com/auth/callback"
    githubConnector: "github"           # shows "Log in with GitHub"
    passwordEnable: true                # shows the native username/password form
    # passwordConnector: "ldap"         # or a redirect-to-IdP password connector
```

The broker owns the GitHub OAuth app + org/team→groups mapping; Kestrel only
names which connector to pre-select. Enable any combination; empty advertises
nothing (you must enable at least one in OIDC mode).

### Bundled Dex (no separate broker)

Don't have a broker? Let the chart run Dex for you, in-cluster, on the same
ingress host under `/dex`:

```bash
helm install kestrel deploy/chart/kestrel \
  --set dex.enabled=true \
  --set ingress.enabled=true \
  --set ingress.host=kestrel.example.com
```

- Kestrel's `--oidc-*` flags are wired automatically (issuer
  `https://<ingress.host>/dex`); do **not** also set `config.oidc.*`.
- A turnkey username/password login works out of the box. Set
  `dex.admin.user` / `dex.admin.password` / `dex.admin.groups`; an empty
  password is generated and printed in the install NOTES.
- GitHub is opt-in: set `dex.github.clientId` and `dex.github.clientSecret` to
  add "Log in with GitHub" (optionally restrict with `dex.github.orgs`).
- `ingress.host` and TLS are required. The kube-apiserver must also trust
  `https://<host>/dex`; see [`../oidc/apiserver-trust.md`](../oidc/apiserver-trust.md).

## Key points about these values

- `config.*` maps 1:1 to the binary's CLI flags; the chart only emits a flag when
  its value differs from the binary default, so an all-empty `config` yields a
  minimal single-operator deployment.
- `rbac.clusterRead` (default `true`) grants the broad read the informer/SSE cache
  needs. Leave it on unless you bind your own narrower roles to the SA.
- The three secrets (OIDC client secret, session key, registry password) are
  **not** plain `config` keys — they come from `existingSecret` (recommended) or
  the inline `secret.create` path (testing only). They are injected as env vars
  and expanded into the flags.
- Set `config.trustedProxy: true` whenever an Ingress/proxy fronts Kestrel.

See `deploy/chart/kestrel/values.yaml` and its `README.md` for the full set of
keys and defaults. Only keys that exist there are used in these examples.
