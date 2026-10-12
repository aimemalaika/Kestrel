# Making the kube-apiserver trust your OIDC issuer

Kestrel forwards each user's **own `id_token`** to the kube-apiserver, which
enforces RBAC on the real identity. For that to work the apiserver must be
configured to **trust the same OIDC issuer** Kestrel logs users in against (your
broker — e.g. the bundled Dex at `https://<host>/dex`, or your own Dex/Keycloak).

> Symptom when this is missing: **login succeeds, but every `/api` call 401s.**
> The user is authenticated to Kestrel, but the apiserver rejects the forwarded
> token because it doesn't trust the issuer. This is the #1 OIDC gotcha.

The four settings (match them to Kestrel's `--oidc-issuer` / `--oidc-client-id`
/ claims):

```
--oidc-issuer-url=https://<host>/dex
--oidc-client-id=kestrel
--oidc-username-claim=email
--oidc-groups-claim=groups
```

## Durability — put it in the source of truth, not a hand-edit

A raw edit to `/etc/kubernetes/manifests/kube-apiserver.yaml` **survives restarts
and reboots** (the kubelet re-reads the on-disk manifest), but it is **lost** the
next time something re-templates that manifest — `kubeadm upgrade`, a Kubespray
re-run, or node reprovisioning. Always put OIDC trust in the config source of
truth so it persists across upgrades.

---

## kubeadm clusters

Add the settings to the kubeadm `ClusterConfiguration` so every manifest
(re-)generation includes them.

`kubeadm-oidc.yaml`:

```yaml
apiVersion: kubeadm.k8s.io/v1beta4
kind: ClusterConfiguration
apiServer:
  extraArgs:
    - name: oidc-issuer-url
      value: https://kestrel.example.com/dex
    - name: oidc-client-id
      value: kestrel
    - name: oidc-username-claim
      value: email
    - name: oidc-groups-claim
      value: groups
```

Apply it on each control-plane node:

```sh
# new clusters:
kubeadm init --config kubeadm-oidc.yaml
# existing clusters (re-renders the apiserver manifest from the config):
sudo kubeadm upgrade apply --config kubeadm-oidc.yaml
```

> On older kubeadm (`v1beta3` and earlier), `extraArgs` is a map, not a list:
> `extraArgs: { oidc-issuer-url: https://…, oidc-client-id: kestrel, … }`.

The kubelet restarts the apiserver automatically after the manifest changes.
Verify:

```sh
grep oidc /etc/kubernetes/manifests/kube-apiserver.yaml
```

### Quick (non-durable) edit

For a one-off test you can edit the static manifest directly — it survives
reboots but **not** the next `kubeadm upgrade`, so don't rely on it:

```sh
sudo vi /etc/kubernetes/manifests/kube-apiserver.yaml   # add the 4 - --oidc-* args
# kubelet restarts the apiserver within a few seconds
```

---

## Kubespray clusters

Kubespray has **first-class OIDC variables** — set them in your inventory
(`group_vars/k8s_cluster/k8s-cluster.yml` or similar) and (re-)run the playbook.
This is durable across every Kubespray run and upgrade.

```yaml
# group_vars/k8s_cluster/k8s-cluster.yml
kube_oidc_auth: true
kube_oidc_url: https://kestrel.example.com/dex
kube_oidc_client_id: kestrel
kube_oidc_username_claim: email
kube_oidc_groups_claim: groups
# optional, if your issuer uses a CA the nodes don't already trust:
# kube_oidc_ca_file: /etc/kubernetes/ssl/oidc-ca.pem
```

Apply:

```sh
ansible-playbook -i inventory/mycluster/hosts.yaml cluster.yml \
  --tags=master            # re-renders the apiserver manifest with the OIDC args
```

Kubespray writes these into the apiserver manifest for you, so they survive node
reboots, re-runs, and upgrades. This is the mechanism the Kestrel **Kubespray
addon** uses to close the apiserver-trust gap automatically.

---

## Managed clusters (EKS / GKE / AKS)

You cannot edit apiserver flags on a managed control plane — register an OIDC
identity provider through the provider's API/console instead (same four values):

- **EKS:** `aws eks associate-identity-provider-config` (issuer URL + client id +
  username/groups claims).
- **GKE / AKS:** the provider's OIDC / identity settings.

Managed OIDC config is stored by the provider, so it is durable by nature.

---

## Bind the identity to RBAC

Trusting the issuer only *authenticates* users; they still need **authorization**.
Bind the group your broker emits (e.g. the bundled Dex admin group
`kestrel-admins`) to a ClusterRole:

```sh
kubectl create clusterrolebinding kestrel-admins \
  --clusterrole=cluster-admin \
  --group=kestrel-admins
```

(Use a narrower role for non-admins; the Kubespray addon templates an admin
binding from inventory. Group names come from the `groups` claim your broker
maps — e.g. a GitHub team or a Dex static-password user's `groups`.)

## CA trust

If your issuer serves TLS from a CA the control-plane nodes don't already trust
(e.g. a self-signed ingress cert — see [`../helm/`](../helm/) TLS options), give
the apiserver the CA: `--oidc-ca-file=/path/to/ca.pem` (kubeadm
`apiServer.extraArgs` / Kubespray `kube_oidc_ca_file`). Browsers and `kubelogin`
must trust it too.

### Self-signed issuer (bundled Dex)

With the bundled Dex on a self-signed ingress (`ingress.tls.mode=selfSigned`, see
[`../helm/`](../helm/)), the CA to trust is the cert the chart generated into the
TLS Secret. Extract it and point the apiserver at it:

```bash
# Name is <fullname>-tls: "kestrel-tls" for release "kestrel",
# "<release>-kestrel-tls" for other release names.
kubectl -n <ns> get secret <kestrel-tls-secret> -o jsonpath='{.data.tls\.crt}' | base64 -d > oidc-ca.pem
```

- Copy `oidc-ca.pem` to each control-plane node, then set the apiserver
  `--oidc-ca-file` in the same durable place as the other `--oidc-*` settings:
  kubeadm `apiServer.extraArgs` (`oidc-ca-file: /path/to/oidc-ca.pem`) or Kubespray
  `kube_oidc_ca_file`.
- Clients (`kubelogin`, the browser) must trust the same CA, or the login
  redirect to `https://<host>/dex` will fail the TLS check.
- Kestrel's own backend already trusts this CA automatically: the chart mounts
  the generated cert and sets `--oidc-ca-file` when `dex.enabled` and
  `ingress.tls.mode=selfSigned`. You only need to handle the apiserver and clients.
- Automatic apiserver and client CA wiring is tracked in #193.
