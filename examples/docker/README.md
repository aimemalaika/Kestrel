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

## Passing config & secrets via the environment

Kestrel reads config **env-natively**: for most flags, a matching `KESTREL_*`
environment variable is used when the flag is empty, so the value never lands on
the process command line (not visible in `docker inspect` / `ps`). Prefer env for
anything sensitive.

```sh
docker run --rm -p 8080:8080 -p 9090:9090 \
  -e KESTREL_SESSION_KEY \
  -e KESTREL_REGISTRY_PASSWORD \
  kestrel:1.0.0 \
  --kubeconfig /kube/config \
  --registry-url https://registry.example.com \
  --registry-username robot
```

Common env vars (flag still wins when both are set):

| Setting | Env var |
| --- | --- |
| Session HMAC key | `KESTREL_SESSION_KEY` |
| OIDC issuer / client-id / redirect | `KESTREL_OIDC_ISSUER` / `KESTREL_OIDC_CLIENT_ID` / `KESTREL_OIDC_REDIRECT_URL` |
| OIDC client secret | `KESTREL_OIDC_CLIENT_SECRET` |
| Login methods | `KESTREL_OIDC_GITHUB_CONNECTOR` / `KESTREL_OIDC_PASSWORD_CONNECTOR` / `KESTREL_OIDC_PASSWORD_ENABLE` |
| Registry password | `KESTREL_REGISTRY_PASSWORD` |
| Cluster display name | `KESTREL_CLUSTER_NAME` |

`KESTREL_SESSION_KEY` must be at least 32 bytes. If omitted, the binary generates
a random key at startup and logs a warning (sessions won't survive a restart).

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

## OIDC (multi-user login) with Docker

OIDC multi-user mode is only useful when the **kube-apiserver trusts the same
issuer** Kestrel logs users in against — a Dex/Keycloak broker (see
[`../oidc/`](../oidc/) for the full broker + apiserver-trust guide). You choose
which **login methods** to advertise; the user picks one on the sign-in screen.

Everything is env-configurable (nothing hardcoded). Behind a TLS-terminating
proxy, add `--trusted-proxy`:

```sh
docker run --rm -p 8080:8080 -p 9090:9090 \
  -e KESTREL_OIDC_CLIENT_SECRET -e KESTREL_SESSION_KEY \
  -e KESTREL_OIDC_ISSUER=https://dex.example.com \
  -e KESTREL_OIDC_CLIENT_ID=kestrel \
  -e KESTREL_OIDC_REDIRECT_URL=https://kestrel.example.com/auth/callback \
  -e KESTREL_OIDC_GITHUB_CONNECTOR=github \
  -e KESTREL_OIDC_PASSWORD_ENABLE=true \
  kestrel:1.0.0 \
  --kubeconfig /kube/config \
  --trusted-proxy
```

This advertises **both** "Log in with GitHub" and a username/password form —
drop either env var to hide that method. For real multi-user deployments prefer
the Helm chart (see [`../helm/`](../helm/)). To just try the login flow locally
without a real broker/cluster, see [`../dev-oidc/`](../dev-oidc/) (local Dex +
`make dev-oidc`).
