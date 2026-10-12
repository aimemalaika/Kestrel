{{/*
Expand the name of the chart.
*/}}
{{- define "kestrel.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "kestrel.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Chart name and version for the chart label.
*/}}
{{- define "kestrel.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels.
*/}}
{{- define "kestrel.labels" -}}
helm.sh/chart: {{ include "kestrel.chart" . }}
{{ include "kestrel.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels.
*/}}
{{- define "kestrel.selectorLabels" -}}
app.kubernetes.io/name: {{ include "kestrel.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
ServiceAccount name.
*/}}
{{- define "kestrel.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "kestrel.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
Name of the Secret holding sensitive values (existing or chart-created).
*/}}
{{- define "kestrel.secretName" -}}
{{- if .Values.existingSecret.name }}
{{- .Values.existingSecret.name }}
{{- else }}
{{- include "kestrel.fullname" . }}
{{- end }}
{{- end }}

{{/*
Whether any sensitive value is wired in (controls whether secret env is added).
*/}}
{{- define "kestrel.hasSecret" -}}
{{- if or .Values.existingSecret.name .Values.secret.create .Values.dex.enabled }}true{{- end }}
{{- end }}

{{/* Dex resource name. */}}
{{- define "kestrel.dexFullname" -}}
{{- printf "%s-dex" (include "kestrel.fullname" .) | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/* Dex issuer URL = https://<ingress.host><dex.path>. Requires ingress.host. */}}
{{- define "kestrel.dexIssuer" -}}
{{- $host := required "dex.enabled requires ingress.host (the OIDC issuer needs a hostname)" .Values.ingress.host -}}
{{- printf "https://%s%s" $host .Values.dex.path -}}
{{- end }}

{{/* Resolve the Dex client secret: value, else existing Secret, else generated.
     The generated value is cached on .Values so every template in one render agrees. */}}
{{- define "kestrel.dexClientSecret" -}}
{{- if .Values.dex.clientSecret -}}
{{- .Values.dex.clientSecret -}}
{{- else if .Values.dex._genClientSecret -}}
{{- .Values.dex._genClientSecret -}}
{{- else -}}
{{- $s := (lookup "v1" "Secret" .Release.Namespace (include "kestrel.dexFullname" .)) -}}
{{- $v := "" -}}
{{- if and $s $s.data (index $s.data "client-secret") -}}
{{- $v = index $s.data "client-secret" | b64dec -}}
{{- else -}}
{{- $v = randAlphaNum 32 -}}
{{- end -}}
{{- $_ := set .Values.dex "_genClientSecret" $v -}}
{{- $v -}}
{{- end -}}
{{- end }}

{{/* Resolve the Dex admin plaintext password: value, else existing Secret, else generated (cached per render). */}}
{{- define "kestrel.dexAdminPassword" -}}
{{- if .Values.dex.admin.password -}}
{{- .Values.dex.admin.password -}}
{{- else if .Values.dex.admin._genPassword -}}
{{- .Values.dex.admin._genPassword -}}
{{- else -}}
{{- $s := (lookup "v1" "Secret" .Release.Namespace (include "kestrel.dexFullname" .)) -}}
{{- $v := "" -}}
{{- if and $s $s.data (index $s.data "admin-password") -}}
{{- $v = index $s.data "admin-password" | b64dec -}}
{{- else -}}
{{- $v = randAlphaNum 20 -}}
{{- end -}}
{{- $_ := set .Values.dex.admin "_genPassword" $v -}}
{{- $v -}}
{{- end -}}
{{- end }}

{{/* Effective ingress TLS mode: explicit mode, else derive from enabled (back-compat). */}}
{{- define "kestrel.ingressTLSMode" -}}
{{- if .Values.ingress.tls.mode -}}
{{- .Values.ingress.tls.mode -}}
{{- else if .Values.ingress.tls.enabled -}}
secret
{{- else -}}
disabled
{{- end -}}
{{- end }}

{{/* TLS Secret name the Ingress references: provided (secret mode) or chart-generated (selfSigned). */}}
{{- define "kestrel.ingressTLSSecretName" -}}
{{- if eq (include "kestrel.ingressTLSMode" .) "selfSigned" -}}
{{- default (printf "%s-tls" (include "kestrel.fullname" .)) .Values.ingress.tls.secretName -}}
{{- else -}}
{{- required "ingress.tls.secretName is required when ingress.tls.mode=secret" .Values.ingress.tls.secretName -}}
{{- end -}}
{{- end }}
