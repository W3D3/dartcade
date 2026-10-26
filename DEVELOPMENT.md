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

**Dev logins.** In development the backend seeds an `Admin` account (with a `Dev Board` and
better-auth's `admin` role, which admin pages and admin-only flags check) and four
players: Luke, Phil, Michael and Gerwyn (`<name>@dartcade.local`). The sign-in page has a button
for each, and the account menu (the avatar on phones, the side nav on desktop) switches between them
in one tap. To try a game with two people on one machine, sign in as one of them in a private
window. Invite `@Luke` to your lobby, switch to the other window and accept the invite, then
start the game — Luke throws his own turns from the other window. The passwords are in
`backend/src/auth/seed.ts`.

**Minigolf's official courses** are seeded into the DB at startup (`seedOfficialCourses`,
`backend/src/db/minigolfCourses.ts`) from the code course in `backend/src/shared/minigolf/courses/`;
the course editor (`#/admin/minigolf/courses`) edits and publishes them from there. Tests and the
bench (`#/admin/minigolf`) still play the code course directly, unseeded.

## Environment variables

`.env` (copied from `.env.example`):

| Variable                 | Required | Description                                                                         |
| ------------------------ | -------- | ----------------------------------------------------------------------------------- |
| `DARTCADE_BOARD_URL`     | Yes      | Board Manager URL, e.g. `http://192.168.1.x:3180`                                   |
| `BRIDGE_SECRET`          | No       | Shared secret for bridge auth (default: `devsecret`)                                |
| `VOICE_STORAGE_LIMIT_MB` | No       | Caller voice packs each user may store, in MB (default `50`; `0` turns imports off) |

Voice clips are stored once per file and shared between users' packs. Deleting a pack removes
the files no pack uses any more; deleting a user (there's no such path in the app yet) cascades
away their packs but leaves their unshared files until `sweepOrphanClips` (`backend/src/db/voices.ts`)
runs without a hash list.

Backend-only (set automatically by the dev compose, documented here for manual runs):

| Variable                                                      | Description                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                                | Postgres connection string                                                                                                                                                                                                                                                                                                                                                                      |
| `PORT`                                                        | HTTP/WS listen port (default `3000`)                                                                                                                                                                                                                                                                                                                                                            |
| `TEST_DATABASE_URL`                                           | Override DB URL for `npm test`                                                                                                                                                                                                                                                                                                                                                                  |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD`                               | A fresh deployment's first admin: while no user has `role = 'admin'`, startup creates this account and logs that it did, without the password (`backend/src/auth/bootstrap.ts`). An existing account with that email is promoted only if `ADMIN_PASSWORD` signs into it. Once any admin exists they do nothing; see `docs/SELFHOSTING.md`'s "First start" (remove them after the first sign-in) |
| `RATE_LIMIT_MAX`                                              | Requests per minute per IP before the API answers 429 (default `200`); the e2e stack raises it                                                                                                                                                                                                                                                                                                  |
| `TRUST_PROXY`                                                 | Behind a reverse proxy: `true`, the number of proxies, or their addresses, so rate limits count each client's address (from `X-Forwarded-For`) instead of the proxy's. Unset when the backend is reached directly                                                                                                                                                                               |
| `PUBLIC_URL`                                                  | The address the app is reached at (e.g. `https://darts.example.com`), so link previews on Twitter, Telegram and the like get an absolute image URL. Unset: the URL stays relative and most previews show no image                                                                                                                                                                               |
| `FLAGS_ON`                                                    | Comma-separated feature flags turned on for everyone (e.g. `gamemode.minigolf.enabled` once Minigolf ships); otherwise each flag's own rule decides (`backend/src/flags/definitions.ts`)                                                                                                                                                                                                        |
| `FLAG_VALUES`                                                 | Comma-separated `key=number` pairs for number flags, e.g. `matchmaking.visitSeconds=45,matchmaking.reserveSeconds=120` (the ranked time limit; defaults 60 and 180). An unknown key or a value that isn't a number stops the backend from starting                                                                                                                                              |
| `APP_VERSION`, `APP_COMMIT`, `APP_BUILD_TIME`                 | The build stamp: the release tag, git commit and build time. The image build sets them from its `VERSION`, `COMMIT` and `BUILD_TIME` args (`.github/workflows/release.yml`); unset (`dev`) in development. Shown in Settings and on `#/admin/system`                                                                                                                                            |
| `SMTP_URL`                                                    | e.g. `smtps://resend:<key>@smtp.resend.com:465`. Unset means no mail                                                                                                                                                                                                                                                                                                                            |
| `MAIL_FROM`                                                   | e.g. `Dartcade <noreply@example.org>`. Required with `SMTP_URL`                                                                                                                                                                                                                                                                                                                                 |
| `FEEDBACK_EMAIL`                                              | Where in-app bug reports and feedback are mailed (with the user's account, page, browser and an optional screenshot). Unset: `LEGAL_CONTACT_EMAIL`; with neither, or without `SMTP_URL`, the app hides reporting                                                                                                                                                                                |
| `EMAIL_VERIFICATION`                                          | `required` or `off`. Defaults to `required` when `SMTP_URL` is set and `off` otherwise. `required` without `SMTP_URL` stops startup with an error                                                                                                                                                                                                                                               |
| `LEGAL_DIR`                                                   | A folder with `terms.md`, `privacy.md` and `imprint.md` overriding the bundled defaults; each file it lacks falls back to the bundled default                                                                                                                                                                                                                                                   |
| `LEGAL_OPERATOR_NAME`, `LEGAL_ADDRESS`, `LEGAL_CONTACT_EMAIL` | Fill `{{operator.name}}`, `{{address}}`, `{{contact.email}}` in the legal texts                                                                                                                                                                                                                                                                                                                 |
| `LEGAL_UPDATED`                                               | The date the legal texts last changed, e.g. `2026-10-17`; fills `{{updated}}` and is returned as each text's `updated`                                                                                                                                                                                                                                                                          |

Dev mail lands in Mailpit at http://localhost:8025.

### Mail in production

Any SMTP relay works; [Resend](https://resend.com) is a simple example:

```
SMTP_URL=smtps://resend:<api-key>@smtp.resend.com:465
MAIL_FROM=Dartcade <noreply@your-domain.org>
```

Resend requires `MAIL_FROM`'s domain to be verified (SPF/DKIM records) before it will relay for
it. Its free tier caps outgoing mail per day and per month — enough for verification and
password-reset mail on a small instance, not for high-volume sending.

`BETTER_AUTH_URL` must be the public https URL once mail is on: verification, reset and delete
links are built from it, and a `localhost` or `http://` link mailed to a user is useless outside
your machine.

Turning `SMTP_URL` on later turns email verification on by default too (see `EMAIL_VERIFICATION`
above). Accounts created while it was off aren't retroactively verified: each has to verify at
their next sign-in, which mails them a fresh link, unless you set `EMAIL_VERIFICATION=off` to
keep verification off regardless of `SMTP_URL`.

An operator in Austria must fill the `LEGAL_*` values (`LEGAL_OPERATOR_NAME`, `LEGAL_ADDRESS`,
`LEGAL_CONTACT_EMAIL`), or the Imprint page shows its `{{…}}` placeholders publicly instead of
real text.

## Running backend tests

The DB tests require a live Postgres:

```bash
docker run -d --name dartcade-test-pg \
  -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=dartcade_test \
  -p 5432:5432 postgres:16-alpine

cd backend && npm install && npm test
```

Benchmarks (`*.perf.test.ts`, e.g. the 3D minigolf shot timing: a full-power shot under 150 ms, fastest of 10) stay out of `npm test`; run them alone with `npm run test:perf`.

Migrations in `backend/src/db/migrations/` are never edited once they're on `main`: add a new,
higher-numbered file instead. CI checks both that a PR only adds migrations and that upgrading a
database from `main` gives the same schema as a fresh one (`scripts/check-migrations.sh`,
`backend/src/db/checkMigrations.ts`).

Override the connection string if needed:

```bash
TEST_DATABASE_URL=postgres://... npm test
```

## Docs screenshots

The PNGs under `docs/` come from a Playwright script, separate from the e2e suite:

```bash
cd e2e && npm ci && npm run screenshots
```

It starts its own stack (`docker-compose.e2e.yaml` plus `e2e/docker-compose.screenshots.yaml`: project
`dartcade-shots` on ports 3021/5181, so it runs beside the dev and e2e stacks) with the dev accounts, the
preview seed (`backend/src/seed`) and every flagged feature on, writes the shots straight into `docs/`, and
tears the stack down. `SCREENSHOTS_REUSE=1` keeps the stack between runs; add a spec name (`npm run
screenshots -- 04`) to retake one file's shots. Scenes live in `e2e/screenshots/`. The camera stills
(`docs/camera`) and the score animations (`docs/score-fx`) need a real board and are taken by hand.

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
   Without `--backend-url` the bridge connects to the hosted dartcade at `play.dartca.de`.
3. With no token configured, the bridge prints a pairing code such as `7KQ4-M2XD`.
4. In dartcade, open **Boards → Pair a board**, enter the code and give the board a name.

The bridge saves its token and pairs automatically from then on. Run `dartcade-bridge --help` for
all options.

## Updating a bridge from the Boards page

A bridge installed as a service (`install-bridge.sh --service`, `install-bridge.ps1`, or
`dartcade-bridge install`) can update itself: the Boards page shows **Update bridge** when the
server offers a newer release. The server offers the newest GitHub release whose major is not above
its own `APP_VERSION` (on 0.x, whose minor is not above its own either); a `dev` server offers
nothing. It sends the bridge only the version (`bridge.update`); the bridge builds the download URL
itself, refuses anything that isn't newer than its own version, checks the release's `SHA256SUMS`
against its `SHA256SUMS.sig` and the public key built into it (`bridge/internal/update/release.pub`),
checks the binary against the sums, and runs it once to see that it reports that version. Then:

- **Linux (systemd).** The hardened unit can't write its own binary. The bridge stages the update
  in its state dir and exits; the unit's `ExecStopPost=+… apply-update`, which runs as root,
  verifies the staged binary again, moves it over `/usr/local/bin/dartcade-bridge`, and systemd
  starts the new one.
- **macOS (launchd).** The daemon runs as root and replaces its binary itself.
- **Windows.** The service runs a copy of the bridge kept in `%ProgramData%\dartcade-bridge`, which
  its account may write; it replaces that copy itself. The copy in Program Files is only run by
  the install script.

Bridges installed before this run the old service definition: running the install command once
more moves them to the new one. A bridge started by hand, the Docker image and dev builds don't
update themselves; the Boards page tells their owner to re-run the install command.

**Release signing.** The Release workflow signs `SHA256SUMS` with the `BRIDGE_SIGNING_KEY` repo
secret, an ed25519 private key in PEM; without it the signing job fails and bridges can't update to
that release. To make a new key pair (and replace `release.pub` in the same PR, a release before the
first one signed with the new key):

```bash
openssl genpkey -algorithm ed25519 -out bridge-signing-key.pem
openssl pkey -in bridge-signing-key.pem -pubout -out bridge/internal/update/release.pub
gh secret set BRIDGE_SIGNING_KEY < bridge-signing-key.pem
```

## Production build

```bash
cd backend
POSTGRES_PASSWORD=secret BRIDGE_SECRET=secret docker compose up --build
```
