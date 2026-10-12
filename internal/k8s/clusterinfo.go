package k8s

// ServerVersion returns the apiserver's reported version (e.g. "v1.33.4").
// It reads through the accessor's shared discovery client (SA creds; the API
// shape is non-sensitive, like the catalog). Returns "" and nil when no
// discovery client is available (e.g. --mock), or "" and the error on failure.
func ServerVersion(acc ClusterAccessor) (string, error) {
	d := acc.Discovery()
	if d == nil {
		return "", nil
	}
	v, err := d.ServerVersion()
	if err != nil {
		return "", err
	}
	return v.GitVersion, nil
}
