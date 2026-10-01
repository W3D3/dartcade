# Development setup

## Prerequisites

- **Docker** — runs the full dev stack
- **Node 22 LTS** (`nvm install 22`) — for running backend tests locally
- **Go 1.23+** — for working on the bridge outside Docker

Run npm through mise's pinned Node 22 (`mise exec -- npm …`), not a newer system Node — npm 11 rewrites `package-lock.json` in a way `npm ci` on npm 10/Node 22 (and CI) rejects.

## Repository layout

```
backend/              Node/TS Fastify server + Svelte SPA
  src/                server source
  frontend/           Svelte 5 frontend (Vite dev server or built dist/)
  Dockerfile          multi-stage production image
  docker-compose.yaml production compose (backend + postgres)
bridge/               Go binary that talks to Board Manager
  Dockerfile          bridge image (used by dev compose)
schema/               HTTP (api-v1.yaml) and game WebSocket (game-ws-v1.json) contracts,
                      adbridge/v1 JSON Schema, shared defs + generated TS/Go types
docker-compose.dev.yaml  dev compose (postgres + backend + frontend + bridge)
.env.example          env var template
```

## Running the full dev stack

```bash
cp .env.example .env
# Edit .env — set DARTCADE_BOARD_URL to your board's local IP
scripts/dev.sh
```

`scripts/dev.sh` wraps `docker compose -f docker-compose.dev.yaml up --build` (extra args are passed through). It also:

- creates `backend/node_modules` and `backend/frontend/node_modules` up front — otherwise Docker creates these volume mount points as root and host-side `npm install` fails with `EACCES`
- stamps the bridge with the current commit, so the Boards page shows e.g. `dev+b503493-dirty` instead of a bare `dev`

Tagged releases report the tag (e.g. `v0.4.2`) instead.

| Service  | URL                        | Notes                          |
|----------|----------------------------|--------------------------------|
| frontend | http://localhost:5173      | Vite hot-reload                |
| backend  | http://localhost:3000      | tsx watch hot-reload           |
| postgres | localhost:5432             | user/pass: dartgames/dev       |
| bridge   | —                          | connects to your board on LAN  |

Once the bridge connects, open http://localhost:5173, pick your board in the dropdown, add players, and start a game.

## Environment variables

`.env` (copied from `.env.example`):

| Variable             | Required | Description                                           |
|----------------------|----------|-------------------------------------------------------|
| `DARTCADE_BOARD_URL` | Yes      | Board Manager URL, e.g. `http://192.168.1.x:3180`    |
| `BRIDGE_SECRET`      | No       | Shared secret for bridge auth (default: `devsecret`) |

Backend-only (set automatically by the dev compose, documented here for manual runs):

| Variable           | Description                              |
|--------------------|------------------------------------------|
| `DATABASE_URL`     | Postgres connection string               |
| `PORT`             | HTTP/WS listen port (default `3000`)     |
| `TEST_DATABASE_URL`| Override DB URL for `npm test`           |

## Running backend tests

The DB tests require a live Postgres:

```bash
docker run -d --name dartcade-test-pg \
  -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=dartcade_test \
  -p 5432:5432 postgres:16-alpine

cd backend && npm install && npm test
```

Override the connection string if needed:
```bash
TEST_DATABASE_URL=postgres://... npm test
```

## Bridge (Go)

```bash
cd bridge
go test ./...
go run ./cmd/bridge --help
```

## Regenerate types and clients from the schema

`schema/` holds the hand-written contracts: the adbridge/v1 JSON Schema (bridge↔Board Manager),
the HTTP API (`api-v1.yaml`, OpenAPI 3.0.3) and the game WebSocket (`game-ws-v1.json`), plus
shared defs in `common-v1.json`. Generated files are committed and never hand-edited.

```bash
npm ci             # repo root — installs the codegen tools
npm run gen:api     # regenerates HTTP/WS types and zod schemas (backend + frontend) and the bridge's Go client
npm run lint:api    # validates schema/api-v1.yaml
cd backend && npm run gen:types   # regenerates adbridge/v1 TS types (backend/src/schema/types.ts)
```

`gen:api` also writes the zod schemas (`backend/src/schema/zod.ts` and the frontend copy) used to parse
incoming data; `oneOf` is generated as a union and unknown fields are stripped.

`mise run gen:api` / `mise run gen:types` run the same from either directory. Once the backend is
running, `/api/docs` serves a Swagger UI for both our API and better-auth's.

## Production build

```bash
cd backend
POSTGRES_PASSWORD=secret BRIDGE_SECRET=secret docker compose up --build
```
