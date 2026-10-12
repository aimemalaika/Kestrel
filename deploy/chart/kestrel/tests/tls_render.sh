#!/usr/bin/env bash
# Render assertions for the ingress TLS modes (#192). No cluster needed.
set -euo pipefail
CHART="$(cd "$(dirname "$0")/.." && pwd)"
fail() { echo "FAIL: $1" >&2; exit 1; }
tmpl() { helm template t "$CHART" "$@"; }

ING=(--set ingress.enabled=true --set ingress.host=k.example.com --set ingress.className=nginx)

# --- default: ingress on, no TLS mode/enabled -> no tls block ---
out="$(tmpl "${ING[@]}")"
echo "$out" | grep -q "kind: Ingress" || fail "ingress not rendered"
echo "$out" | grep -qE "^  tls:" && fail "tls block rendered when mode is disabled/default"
echo "$out" | grep -q "kubernetes.io/tls" && fail "self-signed secret rendered by default"

# --- back-compat: tls.enabled=true + secretName -> secret mode ---
out="$(tmpl "${ING[@]}" --set ingress.tls.enabled=true --set ingress.tls.secretName=my-tls)"
echo "$out" | grep -qE "^  tls:" || fail "tls block missing in back-compat enabled mode"
echo "$out" | grep -q "secretName: my-tls" || fail "back-compat secretName not used"
echo "$out" | grep -q "kubernetes.io/tls" && fail "no self-signed secret should render in secret mode"

# --- mode=secret -> use secretName ---
out="$(tmpl "${ING[@]}" --set ingress.tls.mode=secret --set ingress.tls.secretName=prov-tls)"
echo "$out" | grep -q "secretName: prov-tls" || fail "mode=secret secretName not used"

# --- mode=selfSigned -> generated secret + kubernetes.io/tls Secret ---
out="$(tmpl "${ING[@]}" --set ingress.tls.mode=selfSigned)"
echo "$out" | grep -q "secretName: t-kestrel-tls" || fail "selfSigned ingress secret name wrong"
echo "$out" | grep -q "type: kubernetes.io/tls" || fail "selfSigned TLS Secret not rendered"
echo "$out" | grep -q "tls.crt:" || fail "selfSigned cert missing"
echo "$out" | grep -q "tls.key:" || fail "selfSigned key missing"

# --- mode=disabled explicit -> no tls ---
out="$(tmpl "${ING[@]}" --set ingress.tls.mode=disabled --set ingress.tls.enabled=true)"
echo "$out" | grep -qE "^  tls:" && fail "mode=disabled must override enabled and render no tls"

# --- mode=secret without secretName -> fail ---
if tmpl "${ING[@]}" --set ingress.tls.mode=secret >/dev/null 2>&1; then
  fail "mode=secret without secretName should fail"
fi

echo "ALL TLS RENDER TESTS PASSED"
