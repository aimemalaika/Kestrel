# Kestrel — install & usage guide

**Kestrel** is a single static Go binary that serves an embedded web console (SPA)
and talks to a Kubernetes cluster's apiserver. It gives operators a live,
read-first view of cluster resources (a catalog-driven table for every resource
kind, streamed over SSE), plus pod logs, exec, and port-forward, and optional
modules for an OCI image registry, Helm releases, and Tekton/Argo pipelines.

This directory holds **operator-facing** how-to-install and how-to-use material
plus copy-pasteable example configs. Pick a deploy path below.

---

## Two auth modes — pick one

Kestrel has exactly two authentication modes, chosen by whether you set
`--oidc-issuer`:

### 1. Single-operator mode (no login)

When `--oidc-issuer` is **empty** (the default), Kestrel does **not** present a
login and acts as its **own identity** — in-cluster that is the pod's
ServiceAccount; with `--kubeconfig` it is whatever that kubeconfig grants.
Everyone who can reach the service gets the same full operator view.

Use it for: local development, a single-admin cluster, demos. **Not** for
multi-user access. If you run it this way on a cluster, keep it behind strong
network controls (no public Ingress; reach it via `kubectl port-forward`).

### 2. OIDC multi-user mode (login + per-user token forwarding)

When `--oidc-issuer` is set, each user logs in via OIDC and Kestrel **forwards
that user's own `id_token`** to the kube-apiserver. Every read, apply, delete,
`can-i`, logs, exec, and port-forward then runs **as that user**, under the
cluster's real RBAC — the OpenShift-console model. Kestrel grants nothing on its
own; the apiserver authorizes each request against the user's identity.

> ### Hard requirement
> The cluster's **kube-apiserver OIDC must trust the SAME issuer** that Kestrel
> logs users in against. Kestrel forwards the user's token straight to the
> apiserver; if the apiserver's `--oidc-issuer-url` / `--oidc-client-id` do not
> match what Kestrel uses, every forwarded request is rejected. See
> [`oidc/`](./oidc/) for the apiserver side.

A subtlety worth knowing: Kestrel's live catalog and SSE streams are populated by
a **shared informer cache that watches as Kestrel's own ServiceAccount** (hence
the broad cluster read grant in the Helm chart). What each logged-in user
actually *sees* out of that cache is gated by a **per-user read filter** — every
object is checked with a per-user authorization review before it leaves the
server, failing closed. Writes and the other verbs always run as the user.

---

## Quickstart by deploy path

| Path | When | Guide |
|------|------|-------|
| Local (`--mock` or `--kubeconfig`) | dev, trying it out | [`local/`](./local/) |
| Docker (`docker run`) | containerized single-operator / demo | [`docker/`](./docker/) |
| Helm (in-cluster) | real clusters, single-operator or OIDC | [`helm/`](./helm/) |
| OIDC wiring | enabling multi-user login | [`oidc/`](./oidc/) |

### Fastest look (no cluster)

```sh
kestrel --mock
# open http://localhost:8080
```

Serves stub data so you can see the console without a cluster. See
[`local/`](./local/).

### Against your current cluster (single-operator)

```sh
kestrel --kubeconfig ~/.kube/config
# open http://localhost:8080
```

### In-cluster with Helm

```sh
helm install kestrel ../deploy/chart/kestrel \
  --set image.tag=1.0.0 \
  -f helm/values-single-operator.yaml
```

Swap in `helm/values-oidc.yaml` for multi-user login. See [`helm/`](./helm/).

---

## Usage walkthrough

**Logging in.** In OIDC mode the console redirects you to your identity provider;
after consent you land back on the dashboard. In single-operator mode there is no
login screen. (Auth endpoints: `/auth/login`, `/auth/callback`, `/auth/logout`.)

**Browsing resources.** The console discovers every resource kind the cluster
exposes and renders each as a live table driven by a shared catalog. Rows stream
in and update over SSE, so the table reflects cluster state as it changes. Click a
row to open a detail drawer with the object's YAML and related data.

**Logs / exec / port-forward.** From a pod you can:
- **Logs** — follow a container's log stream live (choose container, tail lines).
- **Exec** — open an interactive shell into a container.
- **Port-forward** — forward a local port to a container port.

In OIDC mode all three run as *you*; the apiserver must allow the corresponding
subresource (`pods/log`, `pods/exec`, `pods/portforward`) for your identity.

**Registry view.** Browse an OCI registry (repositories, tags, image detail:
digest, size, layers), and optionally delete by digest. Enabled only when the
operator sets `--registry-url`; otherwise the registry view reports it is not
configured. See the registry flags in [`docker/`](./docker/) and
[`helm/`](./helm/).

**Helm view.** Lists Helm v3 releases by reading their `helm.sh/release.v1`
Secrets **as the logged-in user** (so your RBAC on Secrets applies), and browses
charts from operator-configured chart repositories (`--helm-repo name=url`). Repo
browsing is operator-level (served from each repo's `index.yaml`), not gated by
cluster RBAC.

**Tekton / Argo views.** These are **generic** — Kestrel reads the Tekton and
Argo CRDs directly through the same catalog/table/stream path as any other
resource; there is no bespoke backend. Pipeline/run status and scan output are
read straight off the resources themselves.

### What needs cluster RBAC

- **Single-operator mode:** the ServiceAccount (or kubeconfig identity) needs read
  (`get`/`list`/`watch`) on the resources you want to see; the Helm chart grants
  cluster-wide read by default. Mutations (apply/delete) need the matching write
  verbs.
- **OIDC mode:** *each user's* RBAC governs what they can read and do. The pod
  ServiceAccount still needs cluster-wide read for the informer cache (the chart's
  default), but per-user delivery is filtered by the user's own authorization.
- **Protected namespaces:** `kube-system`, `kube-public`, `kube-node-lease` are
  hard-blocked for apply/delete by default (`--protected-namespaces`), regardless
  of RBAC.

---

## Operational flags worth knowing

| Flag | Default | Purpose |
|------|---------|---------|
| `--addr` | `:8080` | HTTP listen address (app + API + SPA). |
| `--metrics-addr` | `:9090` | Prometheus `/metrics` on a **separate** listener; empty disables. |
| `--log-level` | `info` | `debug` \| `info` \| `warn` \| `error`. |
| `--rate-limit` / `--rate-burst` | `20` / `40` | Per-caller request rate (req/sec) and burst; `--rate-limit 0` disables. |
| `--trusted-proxy` | `false` | Trust `X-Forwarded-For`/`X-Real-Ip`. Enable **only** behind a proxy/ingress that rewrites them. |
| `--protected-namespaces` | `kube-system,kube-public,kube-node-lease` | Namespaces hard-blocked for apply/delete (empty disables the guard). |
| `--session-key` | random | HMAC key for session cookies (min 32 bytes). Empty = random (sessions don't survive restart / don't work across replicas). |
| `--tls-cert` / `--tls-key` | — | Serve HTTPS directly (usually terminate TLS at the ingress instead). |

The OIDC, registry, and `--helm-repo` flags are covered in the per-path guides.

Metrics are plain Prometheus exposition at `/metrics` on the `--metrics-addr`
listener and are intentionally **not** behind login (a scraper has no session).
