package httpapi

import (
	"encoding/json"
	"errors"
	"log/slog"
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
// *k8s.StatusError values are already normalized (safe) and keep their own
// status/message. Anything else is a 500 whose detail is LOGGED but NOT sent to
// the client: a raw transport error (e.g. "dial tcp 10.x.x.x:443: connect
// refused") would otherwise leak the internal apiserver host/IP.
func WriteError(w http.ResponseWriter, err error) {
	var se *k8s.StatusError
	if errors.As(err, &se) {
		writeStatus(w, se.Code, se.Reason, se.Message)
		return
	}
	slog.Error("internal error serving request", slog.Any("error", err))
	writeStatus(w, http.StatusInternalServerError, "InternalError", "internal error")
}

func writeStatus(w http.ResponseWriter, code int, reason, msg string) {
	writeJSON(w, code, ErrorBody{Error: msg, Code: code, Reason: reason})
}
