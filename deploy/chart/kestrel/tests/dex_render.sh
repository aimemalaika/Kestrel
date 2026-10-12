#!/usr/bin/env bash
# Render assertions for the bundled-Dex chart feature (#191). No cluster needed.
set -euo pipefail
CHART="$(cd "$(dirname "$0")/.." && pwd)"
fail() { echo "FAIL: $1" >&2; exit 1; }
tmpl() { helm template t "$CHART" "$@"; }

# --- disabled (default): no Dex, no /dex, no --oidc-* ---
out="$(tmpl)"
echo "$out" | grep -q "kind: Deployment" || fail "base render produced no Deployment"
echo "$out" | grep -q -- "-dex" && fail "dex objects rendered while disabled"
echo "$out" | grep -q -- "--oidc-issuer" && fail "--oidc-issuer rendered while dex disabled"

# --- enabled (password only) ---
A=(--set dex.enabled=true --set ingress.host=k.example.com --set ingress.enabled=true \
   --set dex.clientSecret=s3cret --set dex.admin.password=pw)
out="$(tmpl --include-crds "${A[@]}")"
echo "$out" | grep -q "name: t-kestrel-dex" || fail "no Dex Service/Deployment"
echo "$out" | grep -q "issuer: https://k.example.com/dex" || fail "wrong/no issuer"
echo "$out" | grep -q "enablePasswordDB: true" || fail "password DB not enabled"
echo "$out" | grep -q "admin@kestrel" || fail "admin static user missing"
echo "$out" | grep -q "ghcr.io/dexidp/dex" || fail "dex image missing"
echo "$out" | grep -q "connectors:" && fail "github connector rendered without creds"
echo "$out" | grep -q "kind: ServiceAccount" || fail "dex SA missing"
echo "$out" | grep -q "kind: Role$"|| fail "dex Role missing"
echo "$out" | grep -q "authcodes.dex.coreos.com" || fail "dex CRDs missing"
for c in authcodes authrequests oauth2clients signingkeies refreshtokens passwords offlinesessionses connectors devicerequests devicetokens; do
  echo "$out" | grep -q "name: $c.dex.coreos.com" || fail "dex CRD $c missing"
done
echo "$out" | grep -q "kind: SigningKey" || fail "SigningKey kind missing"
echo "$out" | grep -q -- "--oidc-issuer=https://k.example.com/dex" || fail "kestrel --oidc-issuer not wired"
echo "$out" | grep -q -- "--oidc-client-id=kestrel" || fail "kestrel --oidc-client-id not wired"
echo "$out" | grep -q -- "--oidc-password-enable" || fail "password-enable not wired"
echo "$out" | grep -q -- "--oidc-github-connector" && fail "github connector wired without creds"
echo "$out" | grep -A3 "name: KESTREL_OIDC_CLIENT_SECRET" | grep -q "name: t-kestrel-dex" || fail "client secret env not from dex secret"

echo "$out" | grep -q "path: /dex" || fail "/dex ingress path missing"
echo "$out" | grep -q "github-client-secret" && fail "github secret key rendered without creds"
echo "$out" | grep -q "kind: ConfigMap" && fail "dex config must live in a Secret, not a ConfigMap"
dexdep="$(tmpl --show-only templates/dex-deployment.yaml "${A[@]}")"
echo "$dexdep" | grep -q "path: /healthz" || fail "dex healthz probe missing"
echo "$dexdep" | grep -q "readOnlyRootFilesystem: true" || fail "dex container securityContext missing"

# --- github enabled ---
G=("${A[@]}" --set dex.github.clientId=gh --set dex.github.clientSecret=ghsec \
   --set ingress.className=nginx)
gout="$(tmpl "${G[@]}")"
echo "$gout" | grep -q -- "--oidc-github-connector=github" || fail "github flag not wired with creds"
echo "$gout" | grep -q "github-client-secret" || fail "github secret key missing"
P=("${A[@]}" --set ingress.className=nginx)
tmpl "${P[@]}" | grep -q "path: /dex" || fail "/dex path missing when ingress enabled"

# --- disabled must stay clean ---
tmpl | grep -q "t-kestrel-dex" && fail "dex rendered while disabled"

# --- generated secrets (no clientSecret / password set) ---
D=(--set dex.enabled=true --set ingress.host=k.example.com --set ingress.enabled=true --set ingress.className=nginx)
dout="$(tmpl "${D[@]}")" || fail "render without clientSecret/password failed"
echo "$dout" | grep -q "client-secret:" || fail "client secret not generated"
echo "$dout" | grep -Eq 'hash: "?\$2[aby]\$' || fail "admin bcrypt hash not generated"
echo "$dout" | grep -q "admin-password:" || fail "admin password not stored in secret"
echo "$dout" | grep -q "admin-hash:" || fail "admin-hash not persisted in dex secret"
h_cm="$(echo "$dout" | grep -E '^[[:space:]]+hash: ' | head -1 | sed -E 's/.*hash: "?([^"]*)"?/\1/')"
h_sec="$(echo "$dout" | grep -E 'admin-hash: ' | head -1 | sed -E 's/.*admin-hash: "?([^"]*)"?/\1/')"
[ -n "$h_cm" ] && [ "$h_cm" = "$h_sec" ] || fail "configmap hash differs from secret admin-hash"
cs_cfg="$(echo "$dout" | grep -E '^[[:space:]]+secret: ' | head -1 | sed -E 's/.*secret: "?([^"]*)"?/\1/')"
cs_sec="$(echo "$dout" | grep -E '^[[:space:]]+client-secret: ' | head -1 | sed -E 's/.*client-secret: "?([^"]*)"?/\1/')"
[ -n "$cs_cfg" ] && [ "$cs_cfg" = "$cs_sec" ] || fail "inline client secret differs from client-secret key"
echo "$dout" | grep -q "config.yaml:" || fail "dex config.yaml not embedded in secret"
echo "$dout" | grep -q "session-key:" || fail "session key not generated when dex enabled"

# admin disabled + no github => no dangling passwordConnector / password DB
noadmin="$(tmpl --include-crds --set dex.enabled=true --set ingress.host=k.example.com --set ingress.enabled=true --set ingress.className=nginx --set dex.admin.enabled=false --set dex.clientSecret=s)"
echo "$noadmin" | grep -q "passwordConnector" && fail "passwordConnector emitted with admin disabled and no connector"
echo "$noadmin" | grep -q "enablePasswordDB" && fail "password DB emitted with admin disabled"

# dex disabled + no secret.create => chart creates no session-key Secret
tmpl | grep -q "session-key:" && fail "session key Secret rendered without dex/secret.create"

# --- selfSigned + dex: backend trusts the generated CA (#208) ---
SS=(--set dex.enabled=true --set ingress.host=k.example.com --set ingress.enabled=true \
    --set ingress.className=nginx --set ingress.tls.mode=selfSigned --set dex.clientSecret=s --set dex.admin.password=pw)
ssout="$(tmpl --include-crds "${SS[@]}")"
echo "$ssout" | grep -q -- "--oidc-ca-file=/etc/kestrel/oidc-ca/ca.crt" || fail "oidc-ca-file flag not wired for selfSigned+dex"
echo "$ssout" | grep -q "mountPath: /etc/kestrel/oidc-ca" || fail "oidc CA volume not mounted"
echo "$ssout" | grep -A4 "name: oidc-ca" | grep -q "key: tls.crt" || fail "oidc CA not sourced from tls.crt"

# non-selfSigned enabled render must NOT carry the ca-file flag
echo "$out" | grep -q -- "--oidc-ca-file" && fail "oidc-ca-file wired without selfSigned mode"

# selfSigned but ingress disabled => no TLS Secret exists, so the CA mount/flag
# must NOT render (else the pod mounts a missing Secret and never starts).
niout="$(tmpl --include-crds --set dex.enabled=true --set ingress.host=k.example.com \
    --set ingress.enabled=false --set ingress.tls.mode=selfSigned --set dex.clientSecret=s --set dex.admin.password=pw)"
echo "$niout" | grep -q -- "--oidc-ca-file" && fail "oidc-ca-file wired while ingress disabled (no TLS Secret)"
echo "$niout" | grep -q "name: oidc-ca" && fail "oidc-ca volume rendered while ingress disabled (missing Secret)"

echo "ALL DEX RENDER TESTS PASSED"
