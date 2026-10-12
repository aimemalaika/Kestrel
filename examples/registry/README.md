# Wiring the image registry module

Kestrel's **Registry** view is an OCI registry browser (repositories → tags →
image detail, with optional delete-by-digest). It is **off by default**: with no
`--registry-url` the backend returns `503` and the UI shows a
**"Registry not configured"** empty state. Nothing is hardcoded — the registry
endpoint always comes from a flag/env.

## Enable it

```sh
kestrel \
  --registry-url http://image-registry.kestrel.svc:5000 \
  --registry-allow-delete            # optional: enable DELETE by digest
```

Point `--registry-url` at your registry's base URL (scheme included). For an
in-cluster registry, use its Service DNS name, e.g.
`http://image-registry.kestrel.svc:5000` (adjust to your namespace/service).

## Auth (optional)

```sh
kestrel \
  --registry-url https://registry.example.com \
  --registry-username ci \
  --registry-password "$KESTREL_REGISTRY_PASSWORD"   # env fallback; keep off the CLI
```

- `--registry-password` falls back to **`$KESTREL_REGISTRY_PASSWORD`** when empty,
  so the secret stays off the process command line.
- `--registry-insecure-skip-verify` skips TLS verification (do **not** use in
  production).
- `--registry-allowed-groups` restricts the module to specific OIDC groups
  (empty = any authenticated user; not enforced in single-operator mode).

## Behaviour

- **No `--registry-url`** → backend `503` → UI shows
  **"Registry not configured — set `--registry-url`."**
- **Unreachable / other error** → UI shows **"Could not reach the registry."**
- **Configured and reachable** → the repo/tag/image browser.
