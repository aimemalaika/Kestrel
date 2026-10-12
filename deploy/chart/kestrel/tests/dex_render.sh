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
cs_cm="$(echo "$dout" | grep -E '^\s+secret: ' | head -1 | sed -E 's/.*secret: "?([^"]*)"?/\1/')"
cs_sec="$(echo "$dout" | grep -E 'client-secret: ' | head -1 | sed -E 's/.*client-secret: "?([^"]*)"?/\1/')"
[ -n "$cs_cm" ] && [ "$cs_cm" = "$cs_sec" ] || fail "generated client secret differs between ConfigMap and Secret"

echo "ALL DEX RENDER TESTS PASSED"
