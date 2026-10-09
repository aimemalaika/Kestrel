package servicemap

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"

	apierrors "k8s.io/apimachinery/pkg/api/errors"
)

// Error / JSON rendering (contract error body {error,code,reason}) is done
// locally — not via httpapi — to avoid an import cycle, mirroring the registry
// and helm modules.

type apiError struct {
	code   int
	reason string
	msg    string
}

func (e *apiError) Error() string { return e.msg }

func errf(code int, reason, format string, a ...any) *apiError {
	return &apiError{code: code, reason: reason, msg: fmt.Sprintf(format, a...)}
}

// mapK8sErr maps a Kubernetes API error (e.g. Forbidden from RBAC) to an apiError
// carrying the upstream status, so an RBAC denial surfaces as 403 rather than a
// blanket 500.
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
