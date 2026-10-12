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

## Login with GitHub (via a Dex/Keycloak broker)

GitHub is **not** a Kubernetes OIDC issuer — its OAuth tokens are opaque, not
verifiable `id_token`s the apiserver can check. So "Log in with GitHub" is done
through a **broker** (Dex or Keycloak) that Kestrel's `--oidc-issuer` points at:

- The broker runs the GitHub OAuth, maps GitHub **org/team → the `groups` claim**,
  and mints a standard OIDC `id_token` signed by the broker.
- The **GitHub org/enterprise slug and GitHub OAuth client-id/secret live only in
  the broker** — never in Kestrel.
- Kestrel's only new knowledge is *which connector to pre-select*, passed as a
  non-secret connector id:

```sh
kestrel \
  --oidc-issuer https://dex.example.com \
  --oidc-client-id kestrel \
  --oidc-github-connector github      # advertises "Log in with GitHub"
```

### Enabling login methods via env

The login-method settings are env-sourceable too (the flag wins when set), so you
can configure them without flags — e.g. in a Deployment's `env:`:

| Setting | Flag | Env var |
| --- | --- | --- |
| GitHub connector id | `--oidc-github-connector` | `KESTREL_OIDC_GITHUB_CONNECTOR` |
| Password connector id (redirect) | `--oidc-password-connector` | `KESTREL_OIDC_PASSWORD_CONNECTOR` |
| Native password form (ROPC) | `--oidc-password-enable` | `KESTREL_OIDC_PASSWORD_ENABLE=true` |

**Offer several and let the user choose:** enable more than one and the login
screen shows them all for the user to pick (Kestrel never auto-selects). The
GitHub / password-connector ids are broker-specific and so must be named
explicitly (flag or env) — there is no hardcoded default.

Clicking the button sends the user to `/auth/login?connector=github`, which
forwards `connector_id=github` to the broker (Dex's connector-selection param).

Example Dex connector:

```yaml
connectors:
  - type: github
    id: github
    name: GitHub
    config:
      clientID: $GITHUB_CLIENT_ID
      clientSecret: $GITHUB_CLIENT_SECRET
      orgs:
        - name: your-org
```

> **Same hard requirement as above:** the kube-apiserver must trust the **broker**
> issuer (`--oidc-issuer-url=https://dex.example.com`). Otherwise login succeeds
> but every `/api` call 401s at the apiserver. This is the #1 cause of "login
> works but nothing loads".

## Username & password

Two ways, both through the broker:

- **Preferred — redirect connector** (`--oidc-password-connector <id>`): the user
  is sent to the broker's own login page (e.g. an LDAP or Keycloak connector). No
  credentials ever touch Kestrel.
- **Fallback — native form** (`--oidc-password-enable`): Kestrel renders a
  username/password form and relays the credentials to the broker's token
  endpoint via the OAuth2 **Resource-Owner-Password (ROPC)** grant, over TLS, in
  the POST body only (never logged, never in a URL). ROPC is discouraged by
  OAuth 2.1 and **not supported by GitHub-via-Dex** — use it only against a
  connector that supports the password grant (Keycloak direct-access-grants,
  LDAP). Kestrel stores no passwords.

## Download kubeconfig / copy login command

A logged-in user can, from the user menu (OIDC mode only):

- **Download kubeconfig** — a kubeconfig wired to the `kubectl oidc-login`
  (kubelogin) exec plugin against the same issuer/client-id. It carries **no
  bearer token**; `kubectl` triggers a fresh login. Install kubelogin
  (`kubectl krew install oidc-login`) to use it.
- **Copy login command** — a one-shot `kubectl config …` embedding the user's
  **own** short-lived `id_token`.

Both endpoints are **HTTPS-only** (or `--trusted-proxy` + `X-Forwarded-Proto:
https`), serve the caller's own identity only, and refuse over plain HTTP.

## Note on the informer cache vs. per-user view

Kestrel's live catalog and SSE streams are filled by a shared informer that
watches **as Kestrel's ServiceAccount** (hence the chart's broad cluster-read
grant). What each user *sees* is then gated by a **per-user read filter** that
authorizes every object for the user before delivering it, failing closed. All
other verbs (get-by-name, apply, delete, can-i, logs, exec, port-forward) run
directly as the user via the forwarded token.
