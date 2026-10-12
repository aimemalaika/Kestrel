# Running Kestrel locally

Three local modes:
- **stub data** (`--mock`, no cluster) — explore the UI,
- **against a real cluster** via your kubeconfig (single-operator, no login),
- **with real OIDC login** via a throwaway local Dex — see
  [`../dev-oidc/`](../dev-oidc/) / `make dev-oidc` (GitHub + username/password on
  localhost, no cluster trust needed; backend runs `--mock`).

## Build / get the binary

Kestrel is a single static binary with the web console embedded. From the repo
root:

```sh
go build -o kestrel ./cmd/kestrel
```

Everything below assumes `./kestrel` is on your path (or call it with its path).

## 1. Stub data — no cluster

```sh
kestrel --mock
```

- Serves stub data instead of connecting to a cluster — useful to explore the
  console UI, demos, and screenshots.
- Open <http://localhost:8080>.
- No login (single-operator). Registry view returns "not configured" unless you
  also pass `--registry-url`. Configured `--helm-repo` chart repos still resolve
  over HTTP in `--mock`, but release lists come back empty (no cluster client).

Quieter or louder logs:

```sh
kestrel --mock --log-level debug
```

## 2. Against your cluster (single-operator)

```sh
kestrel --kubeconfig ~/.kube/config
```

- Kestrel connects using the given kubeconfig and acts as **that identity** — all
  reads/writes/logs/exec run as whatever the kubeconfig grants. There is no
  login; anyone who reaches `localhost:8080` has that full view, so keep it local.
- Omit `--kubeconfig` to use the default resolution (in-cluster, then
  `$KUBECONFIG`, then `~/.kube/config`):

  ```sh
  kestrel
  ```

- Startup **fails fast** if it cannot connect to a cluster — use `--mock` if you
  have no cluster. (A silently broken connection is worse than no start.)

### Pick a different port, see metrics

```sh
kestrel --kubeconfig ~/.kube/config --addr :8081 --metrics-addr :9091
# console:  http://localhost:8081
# metrics:  http://localhost:9091/metrics
```

Disable the metrics listener entirely with `--metrics-addr ""`.

### Try the registry / Helm modules locally

```sh
kestrel --kubeconfig ~/.kube/config \
  --registry-url https://registry.example.com \
  --helm-repo "bitnami=https://charts.bitnami.com/bitnami"
```

`--helm-repo` is repeatable and also accepts comma-separated `name=url` pairs in
one value.

## 3. Try real OIDC login locally (GitHub / username+password)

To see the actual login screen and flow on your machine — without a real IdP or
cluster trust setup — use the bundled local Dex broker:

```sh
make dev-oidc
# → http://localhost:5173, log in with dev@kestrel.local / password
```

That runs the backend in `--mock` mode with OIDC enabled against a local Dex (so
forwarded tokens don't need a real apiserver to trust them). It advertises both
the GitHub button and the username/password form. Full details, and how to add
your GitHub OAuth app, are in [`../dev-oidc/`](../dev-oidc/).

If you want to point a local run at your **own** broker instead, every setting is
env-configurable:

```sh
KESTREL_OIDC_ISSUER=https://dex.example.com \
KESTREL_OIDC_CLIENT_ID=kestrel \
KESTREL_OIDC_CLIENT_SECRET=… \
KESTREL_OIDC_REDIRECT_URL=http://localhost:5173/auth/callback \
KESTREL_OIDC_PASSWORD_ENABLE=true \
KESTREL_SESSION_KEY=$(openssl rand -base64 48) \
kestrel --kubeconfig ~/.kube/config
```

## Notes

- Local single-operator mode is fine for one admin. For multiple users, use OIDC
  (see [`../oidc/`](../oidc/)) — which in turn requires the apiserver to trust the
  same issuer, so real multi-user access is a cluster-deploy concern (see
  [`../helm/`](../helm/)).
- Every `--oidc-*` setting (issuer, client-id, redirect, connectors, password
  form) is also env-sourceable (`KESTREL_OIDC_*`); the flag wins when both are set.
