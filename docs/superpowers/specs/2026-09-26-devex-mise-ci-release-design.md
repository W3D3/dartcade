# DevEx: mise tasks, CI, and release pipeline

## Overview

Add developer tooling infrastructure to the dartcade monorepo:
- `mise.toml` for tool version pinning and task shortcuts
- GitHub Actions CI that runs all three test suites on PRs
- GitHub Actions release workflow that publishes named artifacts on version tags

No existing CI/CD or mise config. Three workloads in the repo: Node/TS backend, Svelte frontend (bundled inside `backend/`), Go bridge binary.

---

## 1. mise configuration

**File:** `mise.toml` (repo root)

Pin tool versions:
- Node 22 (LTS)
- Go 1.23

Tasks (all runnable via `mise run <task>`):

| Task | Command |
|------|---------|
| `dev` | `docker compose -f docker-compose.dev.yaml up --build` |
| `test` | runs all three suites in sequence (backend, frontend, bridge) |
| `test:backend` | `cd backend && npm test` |
| `test:frontend` | `cd backend/frontend && npm test` |
| `test:bridge` | `cd bridge && go test ./...` |
| `build:backend` | `cd backend && npm run build` |
| `build:bridge` | `cd bridge && go build ./cmd/bridge` |
| `gen:types` | `cd backend && npm run gen:types` |

The `test` task is a convenience wrapper; CI uses the individual tasks in parallel jobs.

---

## 2. CI workflow (`.github/workflows/ci.yml`)

**Triggers:** `pull_request` targeting `main`

Three parallel jobs — each sets up its own toolchain:

### `test-backend`
- Runs on: `ubuntu-latest`
- Tools: Node 22
- Services: `postgres:16-alpine` (user: postgres, password: postgres, db: dartcade_test)
- Steps: `npm ci` → `npm test` in `backend/`
- Env: `TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/dartcade_test`

### `test-frontend`
- Runs on: `ubuntu-latest`
- Tools: Node 22
- Steps: `npm ci` → `npm test` in `backend/frontend/`

### `test-bridge`
- Runs on: `ubuntu-latest`
- Tools: Go 1.23
- Steps: `go test ./...` in `bridge/`

---

## 3. Release workflow (`.github/workflows/release.yml`)

**Triggers:** push of tags matching `v*` (e.g. `v0.1.0`)

### Job: `release-bridge-binaries`

Cross-compiles the Go bridge binary using a matrix strategy. All binaries are attached to the GitHub Release (created automatically on tag push via `softprops/action-gh-release`).

Matrix targets:

| GOOS | GOARCH | Artifact name |
|------|--------|--------------|
| linux | amd64 | `dartcade-bridge_linux_amd64` |
| linux | arm64 | `dartcade-bridge_linux_arm64` |
| darwin | amd64 | `dartcade-bridge_darwin_amd64` |
| darwin | arm64 | `dartcade-bridge_darwin_arm64` |
| windows | amd64 | `dartcade-bridge_windows_amd64.exe` |

### Job: `release-bridge-image`

Builds `bridge/Dockerfile` and pushes to GHCR:
- `ghcr.io/<owner>/dartcade-bridge:<tag>` (e.g. `v0.1.0`)
- `ghcr.io/<owner>/dartcade-bridge:latest`

### Job: `release-backend-image`

Builds `backend/Dockerfile` and pushes to GHCR:
- `ghcr.io/<owner>/dartcade:<tag>`
- `ghcr.io/<owner>/dartcade:latest`

Both image jobs use `docker/build-push-action` with GHCR login via `GITHUB_TOKEN` (no extra secrets required). Multi-platform build (`linux/amd64,linux/arm64`) for both images using QEMU + buildx.

---

## Constraints and notes

- Backend tests require a live Postgres; CI uses a service container, not a mock.
- The frontend is bundled into the backend Docker image — it is not a separate release artifact.
- GHCR image names use `github.repository_owner` so they work under any org/user without hardcoding.
- Starting version: `v0.1.0` (consistent with existing `"version": "0.1.0"` in both `package.json` files).
- No secrets beyond `GITHUB_TOKEN` are needed for GHCR.
