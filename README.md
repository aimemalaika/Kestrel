# Kestrel

A fast, generic-first **Kubernetes dashboard** in a single Go binary — OKD/OpenShift-console class, but tiny to run and easy to extend.

[![Go](https://github.com/aimemalaika/Kestrel/actions/workflows/go.yml/badge.svg)](https://github.com/aimemalaika/Kestrel/actions/workflows/go.yml)
[![CI](https://github.com/aimemalaika/Kestrel/actions/workflows/ci.yml/badge.svg)](https://github.com/aimemalaika/Kestrel/actions/workflows/ci.yml)

Kestrel is a web UI for a single Kubernetes cluster. One Go binary embeds the React SPA **and** serves the API — you deploy one container, not two services. It watches the cluster through client-go shared informers and streams live updates to the browser over SSE, with real pod logs, exec, and port-forward.

> **Status: 1.0.** Read-only browsing, live streaming, safe writes, multi-user OIDC auth, and module backends are all implemented and covered by CI (including a real-apiserver integration test). See [Roadmap & status](#roadmap--status).

---

## Why "generic-first"

The design turns on one property: **almost every screen is one generic component pointed at a different resource type.** Adding support for a resource — built-in or CRD — is *data, not code*: it appears in the live catalog, gets a catalog-driven table, detail view, YAML editor, and live stream for free.

A **bespoke** backend or view is written **only** when a system genuinely sits outside the generic Kubernetes path:

- **Generic** (no bespoke code): Deployments, Pods, Services, CRDs, … and even Tekton PipelineRuns and Argo Applications — their state lives on the resource object itself, so the generic table + stream already render them.
- **Bespoke** (justified): an **OCI image registry** (OCI Distribution v2, not a Kubernetes API) and **Helm** (release state is encoded in Secrets) each get a small focused backend.

This discipline keeps the surface small and is the first thing to understand before contributing — see [Contributing](#contributing).

## Features

- **Live resource browser** — a catalog-driven table for every resource kind, streamed over SSE from a shared informer cache; detail drawer with YAML and related events.
- **Pod operations** — follow logs, open an interactive **exec** terminal, and **port-forward**, all over WebSocket/SSE.
- **Safe writes** — Server-Side Apply (with dry-run diff), delete, and a real `can-i` check, with an **audit log** of every mutation and **protected-namespace** guardrails.
- **Multi-user auth (OpenShift-console model)** — OIDC login; Kestrel forwards each user's own token to the API server, so every read/write/log/exec runs **as that user** under real RBAC. A single-operator mode (no OIDC) is the zero-config default for local use.
- **Leak-proof live streams** — the shared informer watches as the ServiceAccount, but a per-user filter authorizes every object before it leaves the cache, so no user sees resources their RBAC forbids.
- **Modules** — browse an OCI registry (repos/tags/image detail, optional delete), view Helm releases and chart repos, a GitOps (Argo) view, Tekton pipelines, and a declarative **service map** with projected SLAs.
- **Operable** — Prometheus `/metrics`, structured (`slog`) logs, rate limiting, `/healthz`, baseline security headers + optional CSP, and a hardened Helm chart + distroless image.

## Architecture

```
Browser (React SPA)  ──HTTP / SSE / WS──▶  Kestrel (one Go binary)  ──client-go──▶  API server
        │                                      │  serves the embedded SPA + /api/*,
   never touches the cluster directly          │  holds the shared informer cache,
   (auth / network stay server-side)           │  authenticates, streams, proxies modules
```

The backend does four jobs, and every feature is a variation on one of them: **authenticate** the caller, **generic CRUD** over any `GroupVersionResource` via the dynamic client, **watch fan-out** (one informer per type → many SSE subscribers, surviving relist/`410 Gone`), and **stream** logs/exec/port-forward.

**Tech stack:** Go 1.26 + `k8s.io/client-go` (backend) · React 18 + TypeScript + Vite + Tailwind 4, dark theme (frontend). The built SPA is embedded via `//go:embed`, so the binary is self-contained.

## Quickstart

**Run against your cluster** (single-operator mode, uses your kubeconfig):

```bash
# build the SPA, then the binary that embeds it
cd web && npm ci && npm run build && cd ..
go build -o kestrel ./cmd/kestrel
./kestrel            # serves http://localhost:8080
```

**Just want to see the UI?** Run with stub data, no cluster needed:

```bash
./kestrel --mock
```

**Container / Helm / OIDC:** see **[`examples/`](examples/)** for ready-to-use install and usage docs — `examples/docker/`, `examples/helm/` (sample `values.yaml` for single-operator and OIDC multi-user), and `examples/oidc/` (the apiserver-must-trust-the-same-issuer requirement, session key, etc.).

## Configuration

All configuration is via flags (and `KESTREL_*` env for secrets). Highlights: `--addr`, `--metrics-addr`, `--oidc-issuer`/`--oidc-client-id`/`--oidc-client-secret`/`--oidc-redirect-url`, `--session-key`, `--tls-cert`/`--tls-key`, `--trusted-proxy`, `--protected-namespaces`, `--registry-url`, `--helm-repo`, `--rate-limit`. Run `./kestrel --help` for the full list; the [`examples/`](examples/) configs are commented.

## Development

```bash
# backend
go build ./... && go test -race ./internal/...

# frontend
cd web && npm ci
npm run dev        # Vite dev server
npm test           # vitest
npm run build      # typecheck + production build
```

**The checks CI enforces** (run them before you push):

- Go: `gofmt -l .` (empty), `go vet ./...`, `go test -race ./...`
- Web (in `web/`): `npm run lint`, `npm run format` (Prettier `--check`), `npm run typecheck`, `npm test`, `npm run build`
- A tag-gated integration test runs the real Server-Side Apply path against an envtest apiserver in CI (`go test -tags envtest ./internal/k8s/`).

Project layout: `cmd/kestrel` (entrypoint) · `internal/` (`k8s`, `stream`, `httpapi`, `authn`, `resource`, `audit`, `obs`, `registry`, `helm`, `servicemap`) · `web/` (the SPA) · `deploy/` (Dockerfile + Helm chart) · `examples/` (install/usage docs).

## Contributing

Contributions are very welcome — this is open source and we'd love your help.

**Before writing a bespoke feature, respect the generic-first rule** (see [Why generic-first](#why-generic-first)): most resources need **no** new code. Add a bespoke backend/view only when a system is genuinely non-Kubernetes (like the registry or Helm); when the data lives on the resource object, use the generic table/stream.

How to contribute:

1. **Open an issue** first for anything non-trivial (a bug, or a proposal with the use case) so we can agree on the approach.
2. **Fork and branch** from `main` (`feat/…`, `fix/…`, `chore/…`).
3. **Keep changes focused**, add tests, and make sure the full gate above is green locally.
4. **Open a PR** describing what changed and why; link the issue. CI must pass (`Go / backend`, `Go / integration`, `CI / web`).
5. For a new bespoke module, mirror `internal/registry` / `internal/helm`: a small package, a `Deps.<Module>` handler, contract-shaped `{error,code,reason}` errors, and per-user access via the forwarded token (fail closed).

Security-sensitive areas (auth/token-forwarding, the per-user stream filter, writes/audit, anything reaching the cluster or an outside host) get extra review scrutiny — call these out in your PR.

Please be respectful and constructive in issues and reviews.

## Roadmap & status

Kestrel is at **1.0**: the full UI, the full backend (connect/read → informer cache + SSE → logs/exec/port-forward → safe writes + audit → OIDC token-forwarding + per-user stream filter → registry/helm modules → observability + a hardened deploy), module UIs wired to their real backends, and a post-1.0 hardening pass are all merged. Ideas on the table for later: a double-submit CSRF token, data-over-WebSocket port-forward for remote deployments, more module backends, and a richer service-map/SLO dashboard. Issues and PRs are how we'll track the next steps.

## License

**TODO:** this project is being opened up and does not yet carry a license. Until a `LICENSE` file is added, all rights are reserved. A permissive license (e.g. Apache-2.0 or MIT) is the intended direction — see the open issue / discussion for the decision.
