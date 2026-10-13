// Package rbac is a read-only RBAC module backend. It exposes
// GET /api/rbac/access?namespace=&name= returning a ServiceAccount's effective
// permissions as a resource x verb matrix.
//
// The matrix is graph-bounded then SAR-confirmed: the SA's RoleBindings and
// ClusterRoleBindings are walked to their Roles/ClusterRoles to find candidate
// resources (and the granting binding), then each candidate resource row is
// confirmed with SubjectAccessReviews (authoritative allowed/denied). Everything
// runs AS THE CALLER (forwarded token), so RBAC gates what is visible; a denial
// surfaces as 403 (fail-closed, never a misleading all-denied matrix).
package rbac

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"sort"
	"strings"
	"sync"

	authzv1 "k8s.io/api/authorization/v1"
	rbacv1 "k8s.io/api/rbac/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"

	"github.com/aimemalaika/Kestrel/internal/k8s"
)

const (
	maxResources = 50 // cap on candidate resource rows
	sarWorkers   = 8  // SAR concurrency limit
)

// verbs are the matrix columns, in display order.
var verbs = []string{"get", "list", "watch", "create", "update", "patch", "delete", "deletecollection"}

type gr struct{ group, resource string }

// commonResources is the baseline a `*` resource rule expands to.
var commonResources = []gr{
	{"", "pods"}, {"", "services"}, {"", "configmaps"}, {"", "secrets"},
	{"apps", "deployments"}, {"apps", "replicasets"}, {"apps", "statefulsets"}, {"apps", "daemonsets"},
	{"batch", "jobs"}, {"batch", "cronjobs"},
	{"", "namespaces"}, {"", "nodes"},
	{"rbac.authorization.k8s.io", "roles"}, {"rbac.authorization.k8s.io", "rolebindings"},
	{"rbac.authorization.k8s.io", "clusterroles"}, {"rbac.authorization.k8s.io", "clusterrolebindings"},
	{"", "serviceaccounts"}, {"", "persistentvolumeclaims"},
	{"networking.k8s.io", "ingresses"},
}

// clusterScoped resources take no namespace in a SubjectAccessReview.
var clusterScoped = map[gr]bool{
	{"", "namespaces"}:                                    true,
	{"", "nodes"}:                                         true,
	{"", "persistentvolumes"}:                             true,
	{"rbac.authorization.k8s.io", "clusterroles"}:         true,
	{"rbac.authorization.k8s.io", "clusterrolebindings"}:  true,
	{"storage.k8s.io", "storageclasses"}:                  true,
	{"apiextensions.k8s.io", "customresourcedefinitions"}: true,
}

// Cell is one verb cell of the matrix.
type Cell struct {
	Allowed bool   `json:"allowed"`
	Binding string `json:"binding,omitempty"`
}

// ResourceAccess is one matrix row.
type ResourceAccess struct {
	Group    string          `json:"group"`
	Resource string          `json:"resource"`
	Verbs    map[string]Cell `json:"verbs"`
}

// Matrix is the response body.
type Matrix struct {
	Subject   string           `json:"subject"`
	Resources []ResourceAccess `json:"resources"`
}

// Handler serves /api/rbac/*.
type Handler struct {
	acc k8s.ClusterAccessor
}

// NewHandler builds the rbac HTTP handler over a cluster accessor.
func NewHandler(acc k8s.ClusterAccessor) *Handler { return &Handler{acc: acc} }

func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	rest := strings.Trim(strings.TrimPrefix(r.URL.Path, "/api/rbac"), "/")
	switch rest {
	case "access":
		h.only(w, r, http.MethodGet, h.access)
	default:
		writeErr(w, errf(http.StatusNotFound, "NotFound", "unknown rbac path %s", r.URL.Path))
	}
}

func (h *Handler) only(w http.ResponseWriter, r *http.Request, method string, fn http.HandlerFunc) {
	if r.Method != method {
		w.Header().Set("Allow", method)
		writeErr(w, errf(http.StatusMethodNotAllowed, "MethodNotAllowed", "%s not allowed on %s", r.Method, r.URL.Path))
		return
	}
	fn(w, r)
}

func (h *Handler) access(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	ns, name := q.Get("namespace"), q.Get("name")
	if ns == "" || name == "" {
		writeErr(w, errf(http.StatusBadRequest, "BadRequest", "missing required query params: namespace and name"))
		return
	}
	if !validName(ns) {
		writeErr(w, errf(http.StatusBadRequest, "BadRequest", "invalid namespace: %q", ns))
		return
	}
	if !validName(name) {
		writeErr(w, errf(http.StatusBadRequest, "BadRequest", "invalid name: %q", name))
		return
	}
	kube, err := k8s.UserClientset(r.Context(), h.acc)
	if err != nil {
		writeErr(w, errf(http.StatusInternalServerError, "InternalError", "could not build a Kubernetes client: %v", err))
		return
	}
	subject := "system:serviceaccount:" + ns + ":" + name
	if kube == nil {
		writeJSON(w, http.StatusOK, Matrix{Subject: subject, Resources: []ResourceAccess{}})
		return
	}
	ctx := r.Context()

	cands, aerr := candidates(ctx, kube, ns, name)
	if aerr != nil {
		writeErr(w, aerr)
		return
	}
	rows, aerr := confirm(ctx, kube, subject, ns, cands)
	if aerr != nil {
		writeErr(w, aerr)
		return
	}
	writeJSON(w, http.StatusOK, Matrix{Subject: subject, Resources: rows})
}

// candidates walks the SA's bindings and returns (group,resource) -> verb ->
// granting-binding label (first binding wins), capped to maxResources.
func candidates(ctx context.Context, kube kubernetes.Interface, ns, name string) (map[gr]map[string]string, *apiError) {
	out := map[gr]map[string]string{}
	add := func(label string, rules []rbacv1.PolicyRule) {
		for _, rule := range rules {
			for _, g := range rule.APIGroups {
				for _, res := range rule.Resources {
					for _, target := range expand(g, res) {
						m := out[target]
						if m == nil {
							m = map[string]string{}
							out[target] = m
						}
						for _, v := range rule.Verbs {
							for _, ev := range expandVerb(v) {
								if _, ok := m[ev]; !ok {
									m[ev] = label
								}
							}
						}
					}
				}
			}
		}
	}
	isSubject := func(subs []rbacv1.Subject) bool {
		for _, s := range subs {
			if s.Kind == "ServiceAccount" && s.Name == name && s.Namespace == ns {
				return true
			}
		}
		return false
	}

	// Scope to RoleBindings in the SA's OWN namespace (plus ClusterRoleBindings
	// below). Those grant access in `ns`, which is what the SARs check. A
	// RoleBinding living in another namespace grants access THERE, not in `ns`,
	// so including it would mis-scope the matrix; cross-namespace reach is a
	// separate (per-namespace) view. This also needs only namespaced list RBAC.
	rbs, err := kube.RbacV1().RoleBindings(ns).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, mapK8sErr(err)
	}
	for i := range rbs.Items {
		rb := &rbs.Items[i]
		if !isSubject(rb.Subjects) {
			continue
		}
		var rules []rbacv1.PolicyRule
		switch rb.RoleRef.Kind {
		case "Role":
			role, err := kube.RbacV1().Roles(rb.Namespace).Get(ctx, rb.RoleRef.Name, metav1.GetOptions{})
			if apierrors.IsNotFound(err) {
				continue
			}
			if err != nil {
				return nil, mapK8sErr(err)
			}
			rules = role.Rules
		case "ClusterRole":
			role, err := kube.RbacV1().ClusterRoles().Get(ctx, rb.RoleRef.Name, metav1.GetOptions{})
			if apierrors.IsNotFound(err) {
				continue
			}
			if err != nil {
				return nil, mapK8sErr(err)
			}
			rules = role.Rules
		default:
			continue
		}
		add("RO:"+rb.Name+"/"+rb.RoleRef.Name, rules)
	}

	crbs, err := kube.RbacV1().ClusterRoleBindings().List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, mapK8sErr(err)
	}
	for i := range crbs.Items {
		crb := &crbs.Items[i]
		if !isSubject(crb.Subjects) {
			continue
		}
		role, err := kube.RbacV1().ClusterRoles().Get(ctx, crb.RoleRef.Name, metav1.GetOptions{})
		if apierrors.IsNotFound(err) {
			continue
		}
		if err != nil {
			return nil, mapK8sErr(err)
		}
		add("CR:"+crb.Name+"/"+crb.RoleRef.Name, role.Rules)
	}

	if len(out) > maxResources {
		keys := sortedKeys(out)[:maxResources]
		capped := make(map[gr]map[string]string, maxResources)
		for _, k := range keys {
			capped[k] = out[k]
		}
		out = capped
	}
	return out, nil
}

// expand maps a rule's (apiGroup, resource) to concrete matrix rows.
func expand(group, resource string) []gr {
	switch {
	case resource == "*":
		var out []gr
		for _, c := range commonResources {
			if group == "*" || group == c.group {
				out = append(out, c)
			}
		}
		return out
	case group == "*":
		for _, c := range commonResources {
			if c.resource == resource {
				return []gr{c}
			}
		}
		return []gr{{"", resource}}
	default:
		return []gr{{group, resource}}
	}
}

func expandVerb(v string) []string {
	if v == "*" {
		return verbs
	}
	return []string{v}
}

func sortedKeys(m map[gr]map[string]string) []gr {
	keys := make([]gr, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Slice(keys, func(i, j int) bool {
		if keys[i].group != keys[j].group {
			return keys[i].group < keys[j].group
		}
		return keys[i].resource < keys[j].resource
	})
	return keys
}

// confirm SAR-checks all 8 verbs per candidate resource, concurrency-limited.
// Any SAR error fails the whole request (fail-closed).
func confirm(ctx context.Context, kube kubernetes.Interface, subject, ns string, cands map[gr]map[string]string) ([]ResourceAccess, *apiError) {
	keys := sortedKeys(cands)
	rows := make([]ResourceAccess, len(keys))

	ctx, cancel := context.WithCancel(ctx)
	defer cancel()
	sem := make(chan struct{}, sarWorkers)
	var (
		wg       sync.WaitGroup
		mu       sync.Mutex
		firstErr *apiError
	)
	for i, k := range keys {
		rows[i] = ResourceAccess{Group: k.group, Resource: k.resource, Verbs: make(map[string]Cell, len(verbs))}
		for _, v := range verbs {
			wg.Add(1)
			sem <- struct{}{}
			go func(i int, k gr, v string) {
				defer wg.Done()
				defer func() { <-sem }()
				if ctx.Err() != nil {
					return
				}
				res, rsub := k.resource, ""
				if p := strings.SplitN(k.resource, "/", 2); len(p) == 2 {
					res, rsub = p[0], p[1]
				}
				// Cluster-scoped resources take no namespace in the SAR.
				sarNS := ns
				if clusterScoped[gr{k.group, res}] {
					sarNS = ""
				}
				sar := &authzv1.SubjectAccessReview{Spec: authzv1.SubjectAccessReviewSpec{
					User: subject,
					ResourceAttributes: &authzv1.ResourceAttributes{
						Verb: v, Group: k.group, Resource: res, Subresource: rsub, Namespace: sarNS,
					},
				}}
				out, err := kube.AuthorizationV1().SubjectAccessReviews().Create(ctx, sar, metav1.CreateOptions{})
				mu.Lock()
				defer mu.Unlock()
				if err != nil {
					if firstErr == nil {
						firstErr = mapK8sErr(err)
						cancel()
					}
					return
				}
				cell := Cell{Allowed: out.Status.Allowed}
				if cell.Allowed {
					cell.Binding = cands[k][v]
				}
				rows[i].Verbs[v] = cell
			}(i, k, v)
		}
	}
	wg.Wait()
	if firstErr != nil {
		return nil, firstErr
	}
	if rows == nil {
		rows = []ResourceAccess{}
	}
	return rows, nil
}

// validName rejects empty names and path/selector-breaking characters.
func validName(s string) bool {
	if s == "" || len(s) > 253 {
		return false
	}
	for _, r := range s {
		switch {
		case r == '/' || r == ',' || r == ' ' || r == '=' || r == '(' || r == ')' || r == '!' || r == ':':
			return false
		case r < 0x20 || r == 0x7f:
			return false
		}
	}
	return true
}

// ---- error / JSON rendering (contract error body {error,code,reason}) ------

type apiError struct {
	code   int
	reason string
	msg    string
}

func (e *apiError) Error() string { return e.msg }

func errf(code int, reason, format string, a ...any) *apiError {
	return &apiError{code: code, reason: reason, msg: fmt.Sprintf(format, a...)}
}

func mapK8sErr(err error) *apiError {
	var st apierrors.APIStatus
	if errors.As(err, &st) {
		s := st.Status()
		code := int(s.Code)
		if code == 0 {
			code = http.StatusInternalServerError
		}
		reason := string(s.Reason)
		if reason == "" {
			reason = "InternalError"
		}
		return errf(code, reason, "%s", s.Message)
	}
	return errf(http.StatusInternalServerError, "InternalError", "kubernetes error: %v", err)
}

func writeErr(w http.ResponseWriter, err error) {
	if ae, ok := err.(*apiError); ok {
		writeJSON(w, ae.code, map[string]any{"error": ae.msg, "code": ae.code, "reason": ae.reason})
		return
	}
	writeJSON(w, http.StatusInternalServerError,
		map[string]any{"error": err.Error(), "code": 500, "reason": "InternalError"})
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}
