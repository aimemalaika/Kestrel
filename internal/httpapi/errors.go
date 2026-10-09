package httpapi

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/aimemalaika/Kestrel/internal/k8s"
)

// ErrorBody is the contract error body.
type ErrorBody struct {
	Error  string `json:"error"`
	Code   int    `json:"code"`
	Reason string `json:"reason"`
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}

// WriteError writes the contract error body with the real HTTP status.
// *k8s.StatusError keeps its own status; anything else is a 500.
func WriteError(w http.ResponseWriter, err error) {
	var se *k8s.StatusError
	if errors.As(err, &se) {
		writeStatus(w, se.Code, se.Reason, se.Message)
		return
	}
	writeStatus(w, http.StatusInternalServerError, "InternalError", err.Error())
}

func writeStatus(w http.ResponseWriter, code int, reason, msg string) {
	writeJSON(w, code, ErrorBody{Error: msg, Code: code, Reason: reason})
}
