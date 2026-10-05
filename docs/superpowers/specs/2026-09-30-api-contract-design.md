# Shared API contract — design

Issue: #34 · Branch: `feat/api-contract` · Date: 2026-09-30

## Goal

One hand-written contract for everything clients use to talk to the backend, so the backend, the Svelte frontend and the Go bridge cannot drift apart silently:

- HTTP: an OpenAPI 3.0.3 spec, enforced at runtime by the backend and consumed through generated types/clients by the frontend and the bridge.
- Game WebSocket (`/ws`): a JSON Schema, enforced by the backend and typed on both sides.
- A Swagger UI showing our API and better-auth's API.

**Why spec-first:** the contract has several clients (frontend, Go bridge, possible future apps), so the spec — not one implementation — is the source of truth. This follows the existing `schema/adbridge-v1.json` pattern (hand-written schema → generated TS and Go).

### Success criteria

- Every `/api` route (except `/api/auth/*`) is described in `schema/api-v1.yaml`, and a test fails if a route and the spec disagree in either direction.
- Invalid requests are rejected with 400 before handlers run; in dev/test, responses that don't match the spec fail with 500.
- The frontend has no hand-written API types and no raw `fetch` to our API; spec/frontend drift is a type error.
- The bridge's pairing calls use a generated Go client.
- CI fails when generated files are stale or the spec is invalid.
- `/api/docs` shows both API documents.

### Out of scope

- The bridge↔backend protocol (`adbridge-v1`, `/bridge` WebSocket) — unchanged.
- better-auth's endpoints stay owned by better-auth (documented via its own generated spec, see §6).

## 1. Spec files and code generation

The repo root is the project root for all of this: `schema/` lives there and outputs span `backend/`, `backend/frontend/` and `bridge/`.

### Source of truth (`schema/`, hand-written)

| File               | Contents                                                                                                                                        |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `common-v1.json`   | Shared JSON Schema `$defs`: `Segment`, `Dart`, `Player`, `ErrorResponse`                                                                        |
| `api-v1.yaml`      | OpenAPI 3.0.3 for every `/api` route and `/health`; `$ref`s `common-v1.json`; cookie auth as a `securityScheme`                                 |
| `game-ws-v1.json`  | JSON Schema (draft-07) for `/ws`: `Snapshot`, `ClientMessage`/`UserAction`, `WsCloseCode`                                                       |
| `adbridge-v1.json` | Unchanged. Its `Segment`/`Coords` move into `common-v1.json` only if the bridge's Go codegen output stays identical; otherwise it is left alone |

OpenAPI **3.0.3**, not 3.1: `oapi-codegen` (Go) has only partial 3.1 support, and Fastify 4's Ajv validates JSON Schema draft-07, which matches 3.0's schema dialect and `adbridge-v1.json`.

### Generated (committed, "do not edit" header)

A root `package.json` provides `npm run gen:api`, which writes:

| Output                                                                | Tool                                                                                            |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `backend/src/schema/api-v1.bundled.json` (spec with `$ref`s resolved) | `@redocly/cli bundle`                                                                           |
| `backend/src/schema/api.ts`                                           | `openapi-typescript`                                                                            |
| `backend/src/schema/game-ws.ts`                                       | `json-schema-to-typescript` (existing tool)                                                     |
| `backend/frontend/src/lib/api/schema.ts`, `game-ws.ts`                | copies of the two above (the frontend container/build stage can't see backend files at runtime) |
| `bridge/internal/api/api.gen.go`                                      | `oapi-codegen` via `go generate`, `include-tags: [bridge]`                                      |

The `$shared` stopgap from #33 (`backend/src/shared/`, its Vite alias, tsconfig path, Dockerfile `COPY` and compose mount) is removed; the generated `WsCloseCode` enum replaces it.

## 2. Backend: wiring, validation, errors

### `fromSpec(operationId)`

`backend/src/api/spec.ts` loads `api-v1.bundled.json` once and exports `fromSpec(operationId)`, returning a Fastify route schema:

- path/query parameters → `params` / `querystring`
- JSON request body → `body`
- JSON responses → `response` keyed by status code (non-JSON responses such as the camera's `image/jpeg` are skipped)
- OpenAPI 3.0 specifics (e.g. `nullable: true`) converted for Ajv

Each route gains `schema: fromSpec('<operationId>')` and a typed generic `Route<'<operationId>'>` derived from `api.ts` (body, params, query, reply), replacing `req.body as any` casts.

### Validation

- **Requests:** tolerant reader. Unknown fields are stripped before the handler (Fastify's default `removeAdditional`), so a newer client — e.g. a bridge updated before the backend — keeps working and handlers only ever see spec'd fields. Malformed input (wrong types, missing required fields, invalid values) → 400 before the handler. Our own clients can't send unknown fields anyway: their generated types make that a compile error.
- **Responses:** Fastify serializes via the response schema (drops undeclared fields, throws on missing required ones). In dev and test an `onSend` hook additionally validates JSON responses with Ajv and turns mismatches into 500, so tests catch drift. Production only serializes.

### Error format

`ErrorResponse = { error: string, details?: Array<{ path: string, message: string }> }` — today's `{ error }` plus optional validation details. A custom error handler maps Fastify validation errors to `{ error: 'invalid request', details }`. Operations may extend it (the 409 from `createSession` keeps `sessionId`).

### Route coverage test

A test builds the app, records every registered route under `/api` plus `/health` (excluding `/api/auth/*`, `/api/docs*` and the `/ws`/`/bridge` WebSockets) and asserts it matches the spec's paths + methods exactly, both ways (`:id` ↔ `{id}`).

### Legacy removal

`api/board.ts` (single-board `/api/board/*` routes driven by `DARTCADE_BOARD_URL`, **without auth**) is deleted along with its registration, tests and the backend's `DARTCADE_BOARD_URL` (the bridge keeps its own). `BoardStatusPanel` uses the per-board operations with the session's board id.

### Operations

| operationId                                                  | Method + path                                                                               | Auth | Tags            |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------- | ---- | --------------- |
| `health`                                                     | GET `/health`                                                                               | –    | system          |
| `listGames`                                                  | GET `/api/games`                                                                            | –    | games           |
| `listBoards`                                                 | GET `/api/boards`                                                                           | ✓    | boards          |
| `createBoard`                                                | POST `/api/boards`                                                                          | ✓    | boards          |
| `renameBoard`                                                | PATCH `/api/boards/{id}`                                                                    | ✓    | boards          |
| `deleteBoard`                                                | DELETE `/api/boards/{id}`                                                                   | ✓    | boards          |
| `getBoardStatus`                                             | GET `/api/boards/{id}/status`                                                               | ✓    | boards          |
| `getBoardEvents`                                             | GET `/api/boards/{id}/events`                                                               | ✓    | boards          |
| `getBoardCamera`                                             | GET `/api/boards/{id}/camera/{index}` (image/jpeg)                                          | ✓    | boards          |
| `startBoard` / `stopBoard` / `resetBoard` / `calibrateBoard` | POST `/api/boards/{id}/{start,stop,reset,calibrate}`                                        | ✓    | boards          |
| `requestPairing`                                             | POST `/api/pairing/request` → 201 `{ code, expiresAt }`                                     | –    | pairing, bridge |
| `getPairingToken`                                            | GET `/api/pairing/{code}/token` → `{ status: pending \| claimed(+token) \| consumed }`, 404 | –    | pairing, bridge |
| `claimPairing`                                               | POST `/api/pairing/claim` → 201 `{ boardId, name }`; 400/404/409/410                        | ✓    | pairing         |
| `listSessions`                                               | GET `/api/sessions`                                                                         | ✓    | sessions        |
| `createSession`                                              | POST `/api/sessions` → 201 `{ sessionId }`; 400/403/409 (+`sessionId`)                      | ✓    | sessions        |
| `getSession`                                                 | GET `/api/sessions/{id}`                                                                    | ✓    | sessions        |
| `deleteSession`                                              | DELETE `/api/sessions/{id}` → 204                                                           | ✓    | sessions        |

Response bodies are specified from the current handlers; the spec documents existing behaviour, apart from the error format above.

## 3. Game WebSocket contract (`schema/game-ws-v1.json`)

- **Server → client — `Snapshot`:** a union discriminated by `gameId`: `{ gameId: 'x01', game: X01Game }` | `{ gameId: 'atc', game: AtcGame }`. Each `*Game` = the game's view + engine fields (`currentVisitDarts`, `totalDarts`, `totalVisits`) + bull off (`phase: 'bulloff'` with `bullOff: BullOffView`, or `bullOff: null`). Other snapshot fields: `type: 'snapshot'`, `sessionId`, `boardId`, `players`, `bmStatus`.
- **Client → server — `ClientMessage`:** `{ type: 'user_action', action: UserAction }`; `UserAction` is a union by `type`: `undo_dart`, `add_dart`, `correct_dart`, `takeout`, `bulloff_skip`, `bulloff_rethrow`, `bulloff_start`.
- **Close codes — `WsCloseCode`:** enum with `tsEnumNames` so the generated TS is a runtime `enum`: 4400 missing session, 4401 unauthorized, 4403 forbidden, 4404 not found, 4500 internal error.
- **Backend:** incoming messages are validated with Ajv against a tolerant copy of `ClientMessage` (extra fields allowed, as for HTTP requests; Ajv's stripping mode can't be used here because it mangles `oneOf` unions). Invalid ones (unknown action, missing fields, not JSON) are logged and ignored (the socket stays open — a buggy client shouldn't drop a player from the game). Outgoing snapshots are validated in dev/test. Game modules' `view()` return the generated view types instead of `Record<string, unknown>`.
- **Frontend:** `ws.ts` is typed from the generated file; `send()` accepts only `UserAction`; the casts in `GameDisplay`/`BullOffPanel` go away.

## 4. Frontend

- **Client:** `src/lib/api/client.ts` exports `api = createClient<paths>()` (`openapi-fetch`). A middleware redirects 401 to `/login`, replacing per-page checks.
- **Types:** `src/lib/api/index.ts` re-exports spec schemas under readable names (`Board`, `Session`, `GameInfo`, `ErrorResponse`, …). The hand-written `Board` (×3) and the types in `BoardStatusPanel`, `SessionBanner`, `PairBoardModal` are deleted.
- **Migration:** every non-auth `fetch` to our API moves to `api` (`Boards`, `CreateSession`, `GameDisplay`, `BoardStatusPanel`, `SessionBanner`, `PairBoardModal`). The camera `<img src>` stays a URL.
- **Auth:** `src/lib/auth.ts` exports `authClient = createAuthClient()` from `better-auth/svelte`; `Login`, `Register`, `App`, `SideNav`, `CreateSession` use `authClient.signIn.email`, `authClient.signUp.email`, `authClient.getSession`. `better-auth` is added to the frontend at the backend's version (1.7.6).
- **Tests:** unit tests for the 401 middleware; existing tests updated where they mocked `fetch`. `tsc` + `svelte-check` are the main drift guard.

## 5. Go bridge

- `bridge/internal/api/generate.go` holds `//go:generate go run github.com/oapi-codegen/oapi-codegen/v2/cmd/oapi-codegen@v2.4.1 …` with `include-tags: [bridge]` → `api.gen.go` (types + client for `requestPairing`, `getPairingToken`).
- `cmd/bridge/config.go` replaces its hand-written pairing structs and requests with the generated client, keeping its timeouts, poll loop and console output.
- `tag: bridge` in the spec marks the operations the bridge depends on.
- Existing `httptest`-based pairing tests keep working; fixtures follow the spec's shapes.

## 6. Swagger UI and better-auth

- `@fastify/swagger` (static mode) serves the bundled spec at `/api/docs/json`; `@fastify/swagger-ui` renders it at `/api/docs`, in all environments (the spec holds nothing secret). Try-it-out uses the session cookie.
- better-auth's `openAPI()` plugin is enabled with `disableDefaultReference: true`; its generated OpenAPI 3.1 document (`/api/auth/open-api/generate-schema`) is the second entry in the UI's spec switcher ("Auth (better-auth)"). It is not merged into `api-v1.yaml`: it is owned and generated by the library and changes with upgrades.

## 7. CI

New `check-generated` job in `.github/workflows/ci.yml` (Node + Go):

1. `redocly lint schema/api-v1.yaml` — valid spec; every operation has an `operationId`, a tag and an error response.
2. `npm run gen:api` at the repo root, then `git diff --exit-code` — fails on stale or hand-edited generated files.

Existing backend/frontend/bridge jobs catch drift via types, the route coverage test and dev/test response validation.

## 8. Delivery order (one branch, reviewable commit by commit)

Each step leaves the app working and tests green:

1. Spec files, root codegen, CI check (nothing consumes them yet)
2. Backend: `fromSpec`, validation, error format, coverage test, route by route; legacy routes removed
3. WebSocket schema, backend message validation, typed `view()`s; `$shared` removed
4. Frontend: `api` client, `authClient`, typed `ws.ts`, all calls migrated
5. Go bridge client
6. Swagger UI + better-auth `openAPI()`

## Risks

- **Ajv/OpenAPI 3.0 differences** (`nullable`, `example` keywords): handled in `fromSpec`'s conversion; covered by the coverage test and per-route tests.
- **Response serialization dropping fields silently in production:** mitigated by dev/test response validation.
- **better-auth client/server version skew:** both pinned to the same version.
- **Go toolchain needed for `gen:api`:** acceptable for contributors (the bridge is Go already); CI has Go.
