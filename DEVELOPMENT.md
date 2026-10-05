# Development setup

## Prerequisites

- **Docker** — runs the full dev stack
- **Node 22 LTS** (`nvm install 22`) — for running backend tests locally
- **Go 1.23+** — for working on the bridge outside Docker

[mise](https://mise.jdx.dev) pins the tool versions (Node 22, Go 1.23) and has the common tasks:

```bash
mise run dev          # full dev stack with hot reload (same as scripts/dev.sh)
mise run test         # backend, frontend and bridge tests
mise run gen:api      # regenerate HTTP/WS types and clients from schema/
mise run gen:types    # regenerate the adbridge/v1 TS types
```

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

| Service  | URL                   | Notes                         |
| -------- | --------------------- | ----------------------------- |
| frontend | http://localhost:5173 | Vite hot-reload               |
| backend  | http://localhost:3000 | tsx watch hot-reload          |
| postgres | localhost:5432        | user/pass: dartgames/dev      |
| bridge   | —                     | connects to your board on LAN |

Once the bridge connects, open http://localhost:5173, pick your board in the dropdown, add players, and start a game.

**No board?** Start a game without one and enter the darts by tapping the board or using the keypad.

**Dev logins.** In development the backend seeds an `Admin` account (with a `Dev Board`) and four
players: Luke, Phil, Michael and Gerwyn (`<name>@dartcade.local`). The sign-in page has a button
for each, and the account menu (the avatar on phones, the side nav on desktop) switches between them
in one tap. To try a game with two people on one machine, sign in as one of them in a private
window. Invite `@Luke` to your lobby, switch to the other window and accept the invite, then
start the game — Luke throws his own turns from the other window. The passwords are in
`backend/src/auth/seed.ts`.

## Environment variables

`.env` (copied from `.env.example`):

| Variable                 | Required | Description                                                                                                                                                                                                                                                                                                                  |
| ------------------------ | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DARTCADE_BOARD_URL`     | Yes      | Board Manager URL, e.g. `http://192.168.1.x:3180`                                                                                                                                                                                                                                                                            |
| `BRIDGE_SECRET`          | No       | Shared secret for bridge auth (default: `devsecret`)                                                                                                                                                                                                                                                                         |
| `VOICE_STORAGE_LIMIT_MB` | No       | Caller voice packs each user may store, in MB (default `50`; `0` turns imports off)                                                                                                                                                                                                                                          |
| `BOARD_LIVE_CAMERA`      | No       | `off` turns off the owner's live camera frames on the Boards page (`GET /api/boards/{id}/camera/{i}/live`, which the backend fetches from the Board Manager); set it where the backend can't reach the boards' network, e.g. in the cloud. Default on. The game's camera stills come through the bridge and are not affected |

Voice clips are stored once per file and shared between users' packs. Deleting a pack removes
the files no pack uses any more; deleting a user (there's no such path in the app yet) cascades
away their packs but leaves their unshared files until `sweepOrphanClips` (`backend/src/db/voices.ts`)
runs without a hash list.

Backend-only (set automatically by the dev compose, documented here for manual runs):

| Variable            | Description                          |
| ------------------- | ------------------------------------ |
| `DATABASE_URL`      | Postgres connection string           |
| `PORT`              | HTTP/WS listen port (default `3000`) |
| `TEST_DATABASE_URL` | Override DB URL for `npm test`       |

## Running backend tests

The DB tests require a live Postgres:

```bash
docker run -d --name dartcade-test-pg \
  -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=dartcade_test \
  -p 5432:5432 postgres:16-alpine

cd backend && npm install && npm test
```

Migrations in `backend/src/db/migrations/` are never edited once they're on `main`: add a new,
higher-numbered file instead. CI checks both that a PR only adds migrations and that upgrading a
database from `main` gives the same schema as a fresh one (`scripts/check-migrations.sh`,
`backend/src/db/checkMigrations.ts`).

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

## Connecting a board

In production the bridge runs on a machine on the same network as the board (often the board PC
itself) and connects out to your dartcade backend.

1. Download the bridge for your platform from [GitHub Releases](https://github.com/W3D3/dartcade/releases)
   (Linux, macOS and Windows builds are published for every `v*` tag), or use the
   `ghcr.io/w3d3/dartcade-bridge` image.
2. Start it:
   ```bash
   dartcade-bridge --board-url http://<board-ip>:3180 --backend-url wss://<your-dartcade-host>
   ```
3. With no token configured, the bridge prints a pairing code such as `7KQ4-M2XD`.
4. In dartcade, open **Boards → Pair a board**, enter the code and give the board a name.

The bridge saves its token and pairs automatically from then on. Run `dartcade-bridge --help` for
all options.

## Production build

```bash
cd backend
POSTGRES_PASSWORD=secret BRIDGE_SECRET=secret docker compose up --build
```
