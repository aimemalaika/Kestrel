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
# node:20-alpine, pinned by digest for supply-chain integrity (update both the
# tag and the digest together when bumping).
FROM node:20-alpine@sha256:fb4cd12c85ee03686f6af5362a0b0d56d50c58a04632e6c0fb8363f609372293 AS web
WORKDIR /src/web

# Install deps first (cached unless the lockfile/manifest change).
COPY web/package.json web/package-lock.json ./
RUN npm ci

# Copy the rest of the frontend and build the SPA.
COPY web/ ./
RUN npm run build
# Result: /src/web/dist

# ---- Stage 2: build the Go binary -----------------------------------------
# golang:1.26-alpine, pinned by digest (update tag + digest together).
FROM golang:1.26-alpine@sha256:3082400e369fa24d5fc60bca20edab3f6d604e0c5a690ec66b295eff4dd87ade AS build
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
# uid/gid 65532. Pinned by @sha256 digest for supply-chain integrity (update the
# tag + digest together when bumping).
FROM gcr.io/distroless/static:nonroot@sha256:e2e927ec666bae08560abb3c55d0659eceabb657f56b6782ab500a9fc7f555e3
COPY --from=build /kestrel /kestrel
USER nonroot:nonroot
# 8080 = app/API/SPA, 9090 = Prometheus /metrics (separate listener).
EXPOSE 8080 9090
ENTRYPOINT ["/kestrel"]
