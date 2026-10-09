# Running Kestrel with Docker

Kestrel ships as a multi-stage, distroless (`nonroot`) image built from the
repo-root `Dockerfile`. The container runs the single binary and exposes two
ports:

- **8080** — the console, API, and SPA (`--addr`).
- **9090** — Prometheus `/metrics` on a separate listener (`--metrics-addr`).

## Build the image

```sh
docker build -t kestrel:1.0.0 .
```

## 1. Stub data (no cluster)

```sh
docker run --rm -p 8080:8080 -p 9090:9090 kestrel:1.0.0 --mock
# open http://localhost:8080
```

Flags go **after** the image name — they are passed straight to the binary.

## 2. Against a cluster (single-operator), mounting a kubeconfig

```sh
docker run --rm -p 8080:8080 -p 9090:9090 \
  -v "$HOME/.kube/config:/kube/config:ro" \
  kestrel:1.0.0 \
  --kubeconfig /kube/config \
  --log-level info
```

The container runs as a non-root user with a read-only root filesystem, so mount
inputs read-only (`:ro`). On a cluster you would normally use the in-cluster
ServiceAccount via the Helm chart instead (see [`../helm/`](../helm/)).

## Passing secrets via the environment

Sensitive flag values can be sourced from env vars rather than typed on the
command line:

```sh
docker run --rm -p 8080:8080 -p 9090:9090 \
  -e SESSION_KEY \
  -e REGISTRY_PASSWORD \
  kestrel:1.0.0 \
  --kubeconfig /kube/config \
  --session-key "$SESSION_KEY" \
  --registry-url https://registry.example.com \
  --registry-username robot \
  --registry-password "$REGISTRY_PASSWORD"
```

> Note: Kestrel currently reads these as **flags**, so even when sourced from env
> the value lands on the process command line (visible in `docker inspect` /
> `ps`). Prefer a locked-down host. Env-native secret reading is a tracked
> hardening follow-up.

`--session-key` must be at least 32 bytes. If omitted, the binary generates a
random key at startup and logs a warning (sessions won't survive a restart).

## Mounting TLS certs (serve HTTPS in-container)

```sh
docker run --rm -p 8443:8443 -p 9090:9090 \
  -v "$PWD/certs:/tls:ro" \
  kestrel:1.0.0 \
  --addr :8443 \
  --tls-cert /tls/tls.crt \
  --tls-key /tls/tls.key
# open https://localhost:8443
```

Usually you terminate TLS at an ingress/reverse proxy instead; do that in the
Helm deployment.

## OIDC (multi-user) with Docker — note

You *can* pass the `--oidc-*` flags to `docker run`, but OIDC multi-user mode is
only useful when the **kube-apiserver trusts the same issuer** Kestrel logs users
in against (see [`../oidc/`](../oidc/)), and you will also need a stable
`--session-key` and a reachable `--oidc-redirect-url` (`…/auth/callback`). Behind
a reverse proxy, add `--trusted-proxy` so the real client IP is honored. For
real multi-user deployments use the Helm chart (see [`../helm/`](../helm/)).

Example (single container behind a TLS-terminating proxy):

```sh
docker run --rm -p 8080:8080 -p 9090:9090 \
  -e OIDC_CLIENT_SECRET -e SESSION_KEY \
  kestrel:1.0.0 \
  --kubeconfig /kube/config \
  --oidc-issuer https://issuer.example.com \
  --oidc-client-id kestrel \
  --oidc-client-secret "$OIDC_CLIENT_SECRET" \
  --oidc-redirect-url https://kestrel.example.com/auth/callback \
  --session-key "$SESSION_KEY" \
  --trusted-proxy
```
