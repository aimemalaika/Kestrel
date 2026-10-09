// Package k8s is the seam between Kestrel and a Kubernetes cluster.
// B0 ships only a stub; B1 swaps in a client-go implementation behind Client.
package k8s

import (
	"context"
	"fmt"
	"net/http"
)

// Object is Kubernetes unstructured JSON.
type Object = map[string]any

// GVR addresses a resource type. Group is the *internal* group: the empty
// string for core/v1 (the HTTP layer maps the contract's "core" to "").
type GVR struct {
	Group    string
	Version  string
	Resource string
}

// Ref addresses a list (Name == "") or a single object.
type Ref struct {
	GVR
	Namespace string // "" for cluster-scoped or all-namespaces
	Name      string
}

// CatalogEntry mirrors the contract's catalog element.
type CatalogEntry struct {
	Group      string   `json:"group"`
	Version    string   `json:"version"`
	Resource   string   `json:"resource"`
	Kind       string   `json:"kind"`
	Namespaced bool     `json:"namespaced"`
	Verbs      []string `json:"verbs"`
}

// CanIRequest / CanIResponse mirror POST /api/can-i. Group uses the contract
// convention ("core" for core/v1) on the wire.
type CanIRequest struct {
	Verb      string `json:"verb"`
	Group     string `json:"group"`
	Version   string `json:"version"`
	Resource  string `json:"resource"`
	Namespace string `json:"namespace,omitempty"`
	Name      string `json:"name,omitempty"`
}

type CanIResponse struct {
	Allowed bool `json:"allowed"`
}

// StatusError is a Kubernetes API error carrying its real HTTP status.
type StatusError struct {
	Code    int
	Reason  string
	Message string
}

func (e *StatusError) Error() string { return e.Message }

func NotFound(format string, a ...any) *StatusError {
	return &StatusError{http.StatusNotFound, "NotFound", fmt.Sprintf(format, a...)}
}

func Forbidden(format string, a ...any) *StatusError {
	return &StatusError{http.StatusForbidden, "Forbidden", fmt.Sprintf(format, a...)}
}

func Conflict(format string, a ...any) *StatusError {
	return &StatusError{http.StatusConflict, "Conflict", fmt.Sprintf(format, a...)}
}

// Client is the cluster seam. Implementations must return *StatusError for
// API errors so the HTTP layer can map them to real statuses.
type Client interface {
	Catalog(ctx context.Context) ([]CatalogEntry, error)
	List(ctx context.Context, ref Ref) ([]Object, error)
	Get(ctx context.Context, ref Ref) (Object, error)
	// Apply performs Server-Side Apply; dryRun must not persist.
	Apply(ctx context.Context, obj Object, dryRun bool) (Object, error)
	Delete(ctx context.Context, ref Ref, dryRun bool) error
	CanI(ctx context.Context, req CanIRequest) (bool, error)
}
