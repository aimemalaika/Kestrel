# Running Kestrel locally

Two local modes: stub data (`--mock`, no cluster needed) and against a real
cluster via your kubeconfig (single-operator). Neither uses OIDC login.

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

## Notes

- Local single-operator mode is fine for one admin. For multiple users, use OIDC
  (see [`../oidc/`](../oidc/)) — which in turn requires the apiserver to trust the
  same issuer, so it is really a cluster-deploy concern (see [`../helm/`](../helm/)).
- To require login even locally you can set the full `--oidc-*` flags, but the
  apiserver-same-issuer requirement still applies.
