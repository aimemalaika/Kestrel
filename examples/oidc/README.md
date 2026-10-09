# Wiring OIDC for Kestrel (multi-user login)

Kestrel's multi-user mode uses **OIDC login + per-user token forwarding** (the
OpenShift-console model): a user logs in against your OIDC provider, and Kestrel
forwards **that user's `id_token`** to the kube-apiserver on every request, so
reads, writes, `can-i`, logs, exec, and port-forward all run as the user under
real cluster RBAC.

## The one requirement you cannot skip

> **The kube-apiserver and Kestrel must trust the SAME OIDC issuer.**

Kestrel does not mint or exchange tokens — it passes the user's `id_token`
straight to the apiserver. If the apiserver isn't configured to accept tokens
from that issuer/client, every forwarded request is rejected (401/403) even
though the user logged into Kestrel fine.

### Kestrel side (flags, or chart `config.oidc.*`)

```sh
kestrel \
  --oidc-issuer       https://issuer.example.com \
  --oidc-client-id    kestrel \
  --oidc-client-secret "$OIDC_CLIENT_SECRET" \
  --oidc-redirect-url https://kestrel.example.com/auth/callback \
  --oidc-groups-claim  groups \
  --oidc-username-claim email \
  --session-key        "$SESSION_KEY"
```

### kube-apiserver side (must match)

The apiserver's OIDC flags must point at the **same issuer** and a client the
`id_token`'s audience satisfies:

```
kube-apiserver \
  --oidc-issuer-url=https://issuer.example.com \
  --oidc-client-id=kestrel \
  --oidc-username-claim=email \
  --oidc-groups-claim=groups
```

(On managed clusters this is configured through the provider's
"OIDC / authentication" settings rather than raw flags. Structured
Authentication Configuration works too — the point is the issuer and client-id
match what Kestrel uses.) The `--oidc-username-claim` / `--oidc-groups-claim`
you give the apiserver determine the identity your RBAC `RoleBinding`s must name;
keep them consistent with Kestrel's `--oidc-username-claim` /
`--oidc-groups-claim`.

## Redirect URL

- Set `--oidc-redirect-url` (chart: `config.oidc.redirectUrl`) to the externally
  reachable URL ending in **`/auth/callback`**, e.g.
  `https://kestrel.example.com/auth/callback`.
- Register that exact URL as an allowed redirect/callback URI in your OIDC client
  app.
- Kestrel's auth endpoints are `/auth/login`, `/auth/callback`, `/auth/logout`.

## Claims

- `--oidc-username-claim` (default `email`) — which `id_token` claim becomes the
  display username.
- `--oidc-groups-claim` (default `groups`) — which claim carries the user's
  groups.
- These should line up with what the apiserver uses so that the identity Kestrel
  shows matches the subject your cluster RBAC authorizes.

## Session key

Session cookies are HMAC-signed. Provide a stable `--session-key` (chart:
`existingSecret` → `session-key`):

```sh
# generate a strong key (min 32 bytes required; base64 of 48 bytes is plenty)
openssl rand -base64 48
```

- Minimum length is **32 bytes**; a shorter key is rejected at startup.
- If omitted, Kestrel generates a random key per start — sessions won't survive a
  restart and won't validate across replicas. Always set a stable key in
  production / multi-replica deployments.

## Behind an ingress

When an Ingress or reverse proxy terminates TLS in front of Kestrel, also set
`--trusted-proxy` (chart: `config.trustedProxy: true`) so the real client IP from
`X-Forwarded-For` is used for rate limiting and request logs. Only enable it when
something in front actually rewrites those headers.

## Note on the informer cache vs. per-user view

Kestrel's live catalog and SSE streams are filled by a shared informer that
watches **as Kestrel's ServiceAccount** (hence the chart's broad cluster-read
grant). What each user *sees* is then gated by a **per-user read filter** that
authorizes every object for the user before delivering it, failing closed. All
other verbs (get-by-name, apply, delete, can-i, logs, exec, port-forward) run
directly as the user via the forwarded token.
