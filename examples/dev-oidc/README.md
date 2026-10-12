# Local OIDC login in dev (Dex)

Exercise Kestrel's real login flow on your machine — no external IdP, no cluster
trust setup. A local **Dex** broker issues the tokens; the backend runs in
`--mock` mode so `/api` returns stub data and forwarded tokens don't need a real
apiserver to trust them. This is for **exercising the login UX**, not real RBAC.

## Quick start

```sh
make dev-oidc
```

That brings up Dex (docker), starts the mock backend with OIDC enabled, and runs
the Vite dev server. Then open **http://localhost:5173** and log in with the
username/password form:

- **Username:** `dev@kestrel.local`
- **Password:** `password`

Stop Dex when done:

```sh
docker compose -f examples/dev-oidc/docker-compose.yml down
```

## What `make dev-oidc` sets

All config is env (no hardcoded values in the SPA or Go source):

| Env var | Value |
| --- | --- |
| `KESTREL_OIDC_ISSUER` | `http://localhost:5556/dex` |
| `KESTREL_OIDC_CLIENT_ID` | `kestrel` |
| `KESTREL_OIDC_CLIENT_SECRET` | `kestrel-dev-secret` |
| `KESTREL_OIDC_REDIRECT_URL` | `http://localhost:5173/auth/callback` |
| `KESTREL_OIDC_PASSWORD_ENABLE` | `true` (native password form) |
| `KESTREL_SESSION_KEY` | a fixed dev key |

The login screen also shows a **Log in with GitHub** button (`make dev-oidc` sets
`KESTREL_OIDC_GITHUB_CONNECTOR=github`). The password form works with no setup;
GitHub needs a one-time GitHub OAuth app — see below.

## Enabling "Log in with GitHub"

GitHub isn't a Kubernetes OIDC issuer, so Dex runs the GitHub OAuth and mints the
token. You need a GitHub OAuth app:

1. GitHub → **Settings → Developer settings → OAuth Apps → New OAuth App**:
   - **Homepage URL:** `http://localhost:5173`
   - **Authorization callback URL:** `http://localhost:5556/dex/callback`  ← Dex's callback, not Kestrel's
2. Copy the app's **Client ID** and generate a **Client secret**, then export them
   before starting (Dex reads them via `$GITHUB_CLIENT_ID` / `$GITHUB_CLIENT_SECRET`):

   ```sh
   export GITHUB_CLIENT_ID=Iv1.xxxxxxxx
   export GITHUB_CLIENT_SECRET=xxxxxxxxxxxxxxxx
   make dev-oidc
   ```

Until those are set, the GitHub button is shown but clicking it won't complete
(Dex has no GitHub credentials) — the password form still works regardless. To
restrict to an org / map teams → groups, see the commented `orgs:` block in
`dex.yaml`.

## Why the Vite proxy matters

`web/vite.config.ts` proxies `/api`, `/authinfo`, and `/auth` to the backend. If
`/authinfo` and `/auth` weren't proxied, the dev SPA (served on :5173) couldn't
reach the backend's auth endpoints and the login screen would show
"No login methods configured" regardless of backend config.

## Against a real cluster (not this demo)

`make dev-oidc` uses `--mock`. Against a real cluster, forwarded id_tokens only
authenticate if the **kube-apiserver trusts the same issuer** — see
`examples/oidc/README.md`. A local Dex issuer won't be trusted by your cluster's
apiserver, so real `/api` calls would 401; that's why this demo stubs the backend.

> Dev only. The client secret, session key, and static password here are
> well-known values for local convenience — never reuse them anywhere real.
