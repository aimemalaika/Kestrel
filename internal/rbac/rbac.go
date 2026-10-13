// Package rbac is a read-only RBAC module backend. It exposes
// GET /api/rbac/access?kind=&name=[&namespace=] returning a subject's
// (ServiceAccount, User or Group) effective permissions as a resource x verb matrix.
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
	maxScopes    = 20 // cap on SAR scopes (namespaces) per matrix cell
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
	kind, ns, name := q.Get("kind"), q.Get("namespace"), q.Get("name")
	switch kind {
	case "ServiceAccount", "User", "Group":
	default:
		writeErr(w, errf(http.StatusBadRequest, "BadRequest", "kind must be ServiceAccount, User or Group"))
		return
	}
	if name == "" {
		writeErr(w, errf(http.StatusBadRequest, "BadRequest", "missing required query param: name"))
		return
	}
	// Namespace applies to ServiceAccounts only; it is ignored for User/Group.
	if kind == "ServiceAccount" {
		if ns == "" {
			writeErr(w, errf(http.StatusBadRequest, "BadRequest", "missing required query param: namespace"))
			return
		}
		if !validName(ns) {
			writeErr(w, errf(http.StatusBadRequest, "BadRequest", "invalid namespace: %q", ns))
			return
		}
	} else {
		ns = ""
	}
	// User/Group names legitimately contain ':' (e.g. system:masters, oidc:alice),
	// so they use a looser check than DNS-style names.
	if (kind == "ServiceAccount" && !validName(name)) || (kind != "ServiceAccount" && !validSubjectName(name)) {
		writeErr(w, errf(http.StatusBadRequest, "BadRequest", "invalid name: %q", name))
		return
	}
	kube, err := k8s.UserClientset(r.Context(), h.acc)
	if err != nil {
		writeErr(w, errf(http.StatusInternalServerError, "InternalError", "could not build a Kubernetes client: %v", err))
		return
	}
	sub := subjectSpec{kind: kind, name: name, ns: ns}
	subject := sub.display()
	if kube == nil {
		writeJSON(w, http.StatusOK, Matrix{Subject: subject, Resources: []ResourceAccess{}})
		return
	}
	ctx := r.Context()

	cs, aerr := candidates(ctx, kube, sub)
	if aerr != nil {
		writeErr(w, aerr)
		return
	}
	rows, aerr := confirm(ctx, kube, sub, cs)
	if aerr != nil {
		writeErr(w, aerr)
		return
	}
	writeJSON(w, http.StatusOK, Matrix{Subject: subject, Resources: rows})
}

// subjectSpec identifies the subject whose access is computed.
type subjectSpec struct{ kind, name, ns string }

// display is the SubjectAccessReview user string (or the group name).
func (s subjectSpec) display() string {
	if s.kind == "ServiceAccount" {
		return "system:serviceaccount:" + s.ns + ":" + s.name
	}
	return s.name
}

// matches reports whether a binding subject list contains this subject.
func (s subjectSpec) matches(subs []rbacv1.Subject) bool {
	for _, x := range subs {
		if x.Kind == s.kind && x.Name == s.name && (s.kind != "ServiceAccount" || x.Namespace == s.ns) {
			return true
		}
	}
	return false
}

// sarSpec builds the SAR spec: User for ServiceAccount/User, Groups for Group.
func (s subjectSpec) sarSpec(ra *authzv1.ResourceAttributes) authzv1.SubjectAccessReviewSpec {
	spec := authzv1.SubjectAccessReviewSpec{ResourceAttributes: ra}
	if s.kind == "Group" {
		spec.Groups = []string{s.name}
	} else {
		spec.User = s.display()
	}
	return spec
}

// cands maps (group,resource) -> verb -> SAR scope namespace -> granting-binding
// label (first binding wins per scope). Scope "" means cluster-wide.
type cands map[gr]map[string]map[string]string

// candidates walks the subject's bindings, capped to maxResources rows.
//
// Scoping: a ServiceAccount keeps the own-namespace model (RoleBindings in its
// namespace + ClusterRoleBindings, all SAR-checked in that namespace). For
// User/Group, RoleBindings are scanned across ALL namespaces and each grant is
// SAR-checked in THAT binding's namespace (ClusterRoleBindings cluster-wide);
// the matrix stays flat: a cell is allowed if any scope allows it, labelled with
// that scope's binding. Scopes per cell are capped (maxScopes) to bound SAR cost.
func candidates(ctx context.Context, kube kubernetes.Interface, sub subjectSpec) (cands, *apiError) {
	out := cands{}
	add := func(scope, label string, rules []rbacv1.PolicyRule) {
		for _, rule := range rules {
			for _, g := range rule.APIGroups {
				for _, res := range rule.Resources {
					for _, target := range expand(g, res) {
						m := out[target]
						if m == nil {
							m = map[string]map[string]string{}
							out[target] = m
						}
						for _, v := range rule.Verbs {
							for _, ev := range expandVerb(v) {
								sc := m[ev]
								if sc == nil {
									sc = map[string]string{}
									m[ev] = sc
								}
								if _, ok := sc[scope]; !ok && len(sc) < maxScopes {
									sc[scope] = label
								}
							}
						}
					}
				}
			}
		}
	}

	rbNS, rbScope, crbScope := sub.ns, func(string) string { return sub.ns }, sub.ns
	if sub.kind != "ServiceAccount" {
		// All namespaces; each binding is checked in its own namespace.
		rbNS, rbScope, crbScope = metav1.NamespaceAll, func(n string) string { return n }, ""
	}
	rbs, err := kube.RbacV1().RoleBindings(rbNS).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, mapK8sErr(err)
	}
	for i := range rbs.Items {
		rb := &rbs.Items[i]
		if !sub.matches(rb.Subjects) {
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
		add(rbScope(rb.Namespace), "RO:"+rb.Name+"/"+rb.RoleRef.Name, rules)
	}

	crbs, err := kube.RbacV1().ClusterRoleBindings().List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, mapK8sErr(err)
	}
	for i := range crbs.Items {
		crb := &crbs.Items[i]
		if !sub.matches(crb.Subjects) {
			continue
		}
		role, err := kube.RbacV1().ClusterRoles().Get(ctx, crb.RoleRef.Name, metav1.GetOptions{})
		if apierrors.IsNotFound(err) {
			continue
		}
		if err != nil {
			return nil, mapK8sErr(err)
		}
		add(crbScope, "CR:"+crb.Name+"/"+crb.RoleRef.Name, role.Rules)
	}

	if len(out) > maxResources {
		keys := sortedKeys(out)[:maxResources]
		capped := make(cands, maxResources)
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

func sortedKeys(m cands) []gr {
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
func confirm(ctx context.Context, kube kubernetes.Interface, sub subjectSpec, cs cands) ([]ResourceAccess, *apiError) {
	keys := sortedKeys(cs)
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
				// Try each scope in order; the first allowing scope wins.
				scopes := make([]string, 0, len(cs[k][v]))
				for sc := range cs[k][v] {
					scopes = append(scopes, sc)
				}
				sort.Strings(scopes)
				cell := Cell{}
				var err error
				for _, sc := range scopes {
					sarNS := sc
					// Cluster-scoped resources take no namespace in the SAR.
					if clusterScoped[gr{k.group, res}] {
						sarNS = ""
					}
					sar := &authzv1.SubjectAccessReview{Spec: sub.sarSpec(&authzv1.ResourceAttributes{
						Verb: v, Group: k.group, Resource: res, Subresource: rsub, Namespace: sarNS,
					})}
					var out *authzv1.SubjectAccessReview
					out, err = kube.AuthorizationV1().SubjectAccessReviews().Create(ctx, sar, metav1.CreateOptions{})
					if err != nil {
						break
					}
					if out.Status.Allowed {
						cell = Cell{Allowed: true, Binding: cs[k][v][sc]}
						break
					}
				}
				mu.Lock()
				defer mu.Unlock()
				if err != nil {
					if firstErr == nil {
						firstErr = mapK8sErr(err)
						cancel()
					}
					return
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

// validSubjectName is validName without the ':' restriction (User/Group names
// such as system:masters or oidc:alice contain colons).
func validSubjectName(s string) bool {
	if s == "" || len(s) > 253 {
		return false
	}
	for _, r := range s {
		switch {
		case r == '/' || r == ',' || r == '=' || r == '(' || r == ')' || r == '!':
			return false
		case r < 0x20 || r == 0x7f:
			return false
		}
	}
	return true
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
