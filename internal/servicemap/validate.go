package servicemap

import (
	"fmt"
	"sort"
	"strings"

	"sigs.k8s.io/yaml"
)

// The model + validation here mirror, field-for-field, the client-side parser in
// web/src/modules/servicemap/parse.ts and the shapes in types.ts. Keeping the two
// in lockstep is deliberate: the UI validates on upload for instant feedback, and
// the server re-validates the same rules so a hand-crafted PUT can't bypass them.

// Workload binds a service node to a Kubernetes workload, either by concrete
// {kind,name} or by a label selector. Namespace is always required.
type Workload struct {
	Namespace string            `json:"namespace"`
	Kind      string            `json:"kind,omitempty"`
	Name      string            `json:"name,omitempty"`
	Selector  map[string]string `json:"selector,omitempty"`
}

// ServiceDep is one edge in the dependency graph. Critical defaults to true.
type ServiceDep struct {
	ID       string `json:"id"`
	Protocol string `json:"protocol,omitempty"`
	Critical bool   `json:"critical"`
}

// ServiceNode is one node in the service map model.
type ServiceNode struct {
	ID          string       `json:"id"`
	DisplayName string       `json:"displayName"`
	SLO         float64      `json:"slo"`
	Workload    *Workload    `json:"workload,omitempty"`
	DependsOn   []ServiceDep `json:"dependsOn"`
}

// Model is the parsed service map returned to the UI (mirrors ServiceMapModel).
type Model struct {
	Name     string        `json:"name"`
	Services []ServiceNode `json:"services"`
}

// ValidationError mirrors the TS ValidationError ({message, serviceId?, edge?}).
type ValidationError struct {
	Message   string   `json:"message"`
	ServiceID string   `json:"serviceId,omitempty"`
	Edge      []string `json:"edge,omitempty"`
}

// malformedError marks a YAML document that could not be parsed at all (→ 400),
// as distinct from a parsed-but-invalid document (→ 422).
type malformedError struct{ err error }

func (e *malformedError) Error() string { return e.err.Error() }

// asObj / asStr mirror parse.ts's isObj / isStr. sigs.k8s.io/yaml decodes YAML
// via JSON, so mappings are map[string]any, lists are []any and numbers float64.
func asObj(v any) (map[string]any, bool) {
	m, ok := v.(map[string]any)
	return m, ok
}

// asStr returns a non-empty string value (isStr requires length > 0 in parse.ts).
func asStr(v any) (string, bool) {
	s, ok := v.(string)
	if ok && len(s) > 0 {
		return s, true
	}
	return "", false
}

// validate parses raw YAML and runs the full client-side rule set. It returns the
// parsed model when valid, the list of validation errors when invalid, or a
// *malformedError when the YAML itself cannot be parsed (caller maps that to 400).
func validate(raw []byte) (*Model, []ValidationError, error) {
	var doc any
	if err := yaml.Unmarshal(raw, &doc); err != nil {
		return nil, nil, &malformedError{err: err}
	}
	root, ok := asObj(doc)
	if !ok {
		return nil, []ValidationError{{Message: "Document must be a YAML mapping"}}, nil
	}

	var errs []ValidationError
	if root["apiVersion"] != "kestrel.dev/v1" {
		errs = append(errs, ValidationError{Message: fmt.Sprintf(`apiVersion must be "kestrel.dev/v1" (got %s)`, stringify(root["apiVersion"]))})
	}
	if root["kind"] != "ServiceMap" {
		errs = append(errs, ValidationError{Message: fmt.Sprintf(`kind must be "ServiceMap" (got %s)`, stringify(root["kind"]))})
	}
	servicesRaw, ok := root["services"].([]any)
	if !ok {
		errs = append(errs, ValidationError{Message: "services must be a list"})
		return nil, errs, nil
	}

	name := "service-map"
	if meta, ok := asObj(root["metadata"]); ok {
		if n, ok := asStr(meta["name"]); ok {
			name = n
		}
	}

	services := make([]ServiceNode, 0, len(servicesRaw))
	seen := map[string]bool{}
	for i, rawAny := range servicesRaw {
		raw, ok := asObj(rawAny)
		if !ok {
			errs = append(errs, ValidationError{Message: fmt.Sprintf("services[%d] must be a mapping", i)})
			continue
		}
		id, ok := asStr(raw["id"])
		if !ok {
			errs = append(errs, ValidationError{Message: fmt.Sprintf(`services[%d] is missing a required "id"`, i)})
			continue
		}
		if seen[id] {
			errs = append(errs, ValidationError{Message: fmt.Sprintf(`Duplicate service id "%s"`, id), ServiceID: id})
		}
		seen[id] = true

		slo, sloOK := raw["slo"].(float64)
		if !sloOK || !(slo > 0 && slo <= 100) {
			errs = append(errs, ValidationError{Message: fmt.Sprintf(`Service "%s": slo must be a number where 0 < slo <= 100`, id), ServiceID: id})
		}

		workload, werrs := parseWorkload(id, raw)
		errs = append(errs, werrs...)

		dependsOn, derrs := parseDependsOn(id, raw)
		errs = append(errs, derrs...)

		displayName := id
		if dn, ok := asStr(raw["displayName"]); ok {
			displayName = dn
		}
		sloVal := 0.0
		if sloOK {
			sloVal = slo
		}
		services = append(services, ServiceNode{
			ID:          id,
			DisplayName: displayName,
			SLO:         sloVal,
			Workload:    workload,
			DependsOn:   dependsOn,
		})
	}

	// Dangling dependency references: every dependsOn.id must be a declared service.
	for _, s := range services {
		for _, d := range s.DependsOn {
			if !seen[d.ID] {
				errs = append(errs, ValidationError{
					Message:   fmt.Sprintf(`Service "%s" depends on undeclared service "%s"`, s.ID, d.ID),
					ServiceID: s.ID,
					Edge:      []string{s.ID, d.ID},
				})
			}
		}
	}

	errs = append(errs, detectCycles(services)...)

	if len(errs) > 0 {
		return nil, errs, nil
	}
	return &Model{Name: name, Services: services}, nil, nil
}

// parseWorkload mirrors the workload branch of parse.ts: a workload is either
// {namespace, kind, name} (no selector) or {namespace, [kind,] selector} (no
// name); namespace is always required.
func parseWorkload(id string, raw map[string]any) (*Workload, []ValidationError) {
	wAny, present := raw["workload"]
	if !present {
		return nil, nil
	}
	w, wok := asObj(wAny)
	ns, nsok := "", false
	if wok {
		ns, nsok = asStr(w["namespace"])
	}
	if !wok || !nsok {
		return nil, []ValidationError{{Message: fmt.Sprintf(`Service "%s": workload requires a namespace`, id), ServiceID: id}}
	}

	kind, kindOK := asStr(w["kind"])
	wname, nameOK := asStr(w["name"])
	_, selectorPresent := w["selector"]
	_, namePresent := w["name"]
	selMap, selIsObj := asObj(w["selector"])

	switch {
	case kindOK && nameOK && !selectorPresent:
		return &Workload{Namespace: ns, Kind: kind, Name: wname}, nil
	case selIsObj && len(selMap) > 0 && allStringValues(selMap) && !namePresent:
		wl := &Workload{Namespace: ns, Selector: toStringMap(selMap)}
		if kindOK {
			wl.Kind = kind
		}
		return wl, nil
	default:
		return nil, []ValidationError{{Message: fmt.Sprintf(`Service "%s": workload must be {namespace, kind, name} or {namespace, selector}`, id), ServiceID: id}}
	}
}

// parseDependsOn mirrors the dependsOn branch of parse.ts.
func parseDependsOn(id string, raw map[string]any) ([]ServiceDep, []ValidationError) {
	deps := []ServiceDep{}
	dAny, present := raw["dependsOn"]
	if !present {
		return deps, nil
	}
	dList, isList := dAny.([]any)
	if !isList {
		return deps, []ValidationError{{Message: fmt.Sprintf(`Service "%s": dependsOn must be a list`, id), ServiceID: id}}
	}
	var errs []ValidationError
	for _, e := range dList {
		d, dok := asObj(e)
		did, didok := "", false
		if dok {
			did, didok = asStr(d["id"])
		}
		if !dok || !didok {
			errs = append(errs, ValidationError{Message: fmt.Sprintf(`Service "%s": dependsOn entry is missing "id"`, id), ServiceID: id})
			continue
		}
		dep := ServiceDep{ID: did, Critical: true}
		if proto, ok := asStr(d["protocol"]); ok {
			dep.Protocol = proto
		}
		if c, ok := d["critical"].(bool); ok {
			dep.Critical = c
		}
		deps = append(deps, dep)
	}
	return deps, errs
}

// detectCycles mirrors the DFS colouring in parse.ts. A later service with the
// same id wins in the id→node map (matching JS Map insertion-overwrite).
func detectCycles(services []ServiceNode) []ValidationError {
	byID := map[string]*ServiceNode{}
	for i := range services {
		byID[services[i].ID] = &services[i]
	}
	const inStack, done = 1, 2
	colour := map[string]int{}
	var stack []string
	reported := map[string]bool{}
	var errs []ValidationError

	var visit func(id string)
	visit = func(id string) {
		colour[id] = inStack
		stack = append(stack, id)
		if node := byID[id]; node != nil {
			for _, d := range node.DependsOn {
				if _, ok := byID[d.ID]; !ok {
					continue
				}
				switch colour[d.ID] {
				case inStack:
					cyc := append([]string(nil), stack[indexOf(stack, d.ID):]...)
					key := cycleKey(cyc)
					if !reported[key] {
						reported[key] = true
						errs = append(errs, ValidationError{
							Message: "Dependency cycle: " + strings.Join(append(append([]string(nil), cyc...), d.ID), " -> "),
							Edge:    []string{id, d.ID},
						})
					}
				case 0: // unvisited
					visit(d.ID)
				}
			}
		}
		stack = stack[:len(stack)-1]
		colour[id] = done
	}

	for _, s := range services {
		if _, ok := colour[s.ID]; !ok {
			visit(s.ID)
		}
	}
	return errs
}

func indexOf(ss []string, want string) int {
	for i, s := range ss {
		if s == want {
			return i
		}
	}
	return 0
}

// cycleKey builds the dedupe key parse.ts uses: the cycle's ids sorted and joined.
func cycleKey(cyc []string) string {
	sorted := append([]string(nil), cyc...)
	sort.Strings(sorted)
	return strings.Join(sorted, ",")
}

func allStringValues(m map[string]any) bool {
	for _, v := range m {
		if _, ok := v.(string); !ok {
			return false
		}
	}
	return true
}

func toStringMap(m map[string]any) map[string]string {
	out := make(map[string]string, len(m))
	for k, v := range m {
		out[k], _ = v.(string)
	}
	return out
}

// stringify renders a value for an error message the way String(x) would in JS
// (absent/null → "undefined"/"null"), used only for apiVersion/kind diagnostics.
func stringify(v any) string {
	if v == nil {
		return "undefined"
	}
	return fmt.Sprintf("%v", v)
}
