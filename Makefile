# Kestrel dev helpers.
#
#   make dev       Go backend (:8080, live cluster via kubeconfig) + Vite dev
#                  server with HMR -> open http://localhost:5173
#   make dev-mock  Go backend with --mock (stub data) + Vite dev server (HMR)
#   make dev-api   just the Go backend on :8080 (serves /api)
#   make dev-ui    just the Vite dev server, mock client, no backend
#   make build     build the SPA and the embedding binary (./kestrel)
#
# `make dev` / `make dev-mock` run both processes and tear both down on Ctrl-C.
# Vite proxies /api (incl. SSE and exec/port-forward WebSockets) to the backend;
# override the backend origin with KESTREL_BACKEND if you change BACKEND_ADDR.

BACKEND_ADDR ?= :8080
# Health URL to poll before starting Vite. Works for the default ":8080"
# (-> localhost:8080); override if you bind a specific host in BACKEND_ADDR.
HEALTH_URL ?= http://localhost$(BACKEND_ADDR)/healthz

.PHONY: dev dev-mock dev-api dev-ui build

dev-api:
	go run ./cmd/kestrel --addr $(BACKEND_ADDR)

dev-ui:
	cd web && npm run dev

# Wait (up to ~60s) for the backend's /healthz before starting Vite, so the SPA
# doesn't flood ECONNREFUSED while `go run` is still compiling/binding.
dev:
	@echo "Kestrel dev: backend $(BACKEND_ADDR) + Vite (HMR) -> http://localhost:5173"
	@trap 'kill 0' EXIT INT TERM; \
	  go run ./cmd/kestrel --addr $(BACKEND_ADDR) & \
	  printf 'waiting for backend '; \
	  for i in $$(seq 1 120); do \
	    curl -sf $(HEALTH_URL) >/dev/null 2>&1 && { echo 'ready'; break; }; \
	    printf '.'; sleep 0.5; \
	  done; \
	  ( cd web && npm run dev:live ); \
	  wait

dev-mock:
	@echo "Kestrel dev (mock backend): backend $(BACKEND_ADDR) + Vite (HMR) -> http://localhost:5173"
	@trap 'kill 0' EXIT INT TERM; \
	  go run ./cmd/kestrel --addr $(BACKEND_ADDR) --mock & \
	  printf 'waiting for backend '; \
	  for i in $$(seq 1 120); do \
	    curl -sf $(HEALTH_URL) >/dev/null 2>&1 && { echo 'ready'; break; }; \
	    printf '.'; sleep 0.5; \
	  done; \
	  ( cd web && npm run dev:live ); \
	  wait

build:
	cd web && npm run build
	go build -o kestrel ./cmd/kestrel
