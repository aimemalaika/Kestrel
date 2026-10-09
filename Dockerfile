# syntax=docker/dockerfile:1
#
# Kestrel container image — multi-stage build.
#
# Stage 1 (web):   build the Vite SPA -> /src/web/dist
# Stage 2 (build): build the Go binary, embedding web/dist via //go:embed
# Stage 3 (final): distroless static, nonroot
#
# Build from the repo root (the build context must be the repo), e.g.:
#   docker build -t kestrel:dev .

# ---- Stage 1: build the frontend ------------------------------------------
FROM node:20-alpine AS web
WORKDIR /src/web

# Install deps first (cached unless the lockfile/manifest change).
COPY web/package.json web/package-lock.json ./
RUN npm ci

# Copy the rest of the frontend and build the SPA.
COPY web/ ./
RUN npm run build
# Result: /src/web/dist

# ---- Stage 2: build the Go binary -----------------------------------------
FROM golang:1.26-alpine AS build
WORKDIR /src

# Module cache layer (cached unless go.mod/go.sum change).
COPY go.mod go.sum ./
RUN go mod download

# Go source. web/*.go is needed for the //go:embed directive in web/embed.go.
COPY cmd/ ./cmd/
COPY internal/ ./internal/
COPY web/ ./web/

# Drop the dev placeholder and drop in the real build from the web stage,
# so //go:embed all:dist embeds the actual SPA assets.
RUN rm -rf web/dist
COPY --from=web /src/web/dist ./web/dist

# Static, stripped, reproducible-ish binary.
RUN CGO_ENABLED=0 GOOS=linux go build \
      -trimpath \
      -ldflags "-s -w" \
      -o /kestrel ./cmd/kestrel

# ---- Stage 3: final runtime image -----------------------------------------
# distroless/static: no shell, no package manager; nonroot variant runs as
# uid/gid 65532. Pinned to a tag; pin by @sha256 digest for stricter supply chain.
FROM gcr.io/distroless/static:nonroot
COPY --from=build /kestrel /kestrel
USER nonroot:nonroot
# 8080 = app/API/SPA, 9090 = Prometheus /metrics (separate listener).
EXPOSE 8080 9090
ENTRYPOINT ["/kestrel"]
