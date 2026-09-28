# Board Pairing Workflow — Design Spec

**Status:** approved  
**Date:** 2026-09-28

---

## 1. Summary

A bridge with no token in its config enters a pairing flow on startup: it requests an
8-character code from the backend, displays it in the terminal, and polls until a logged-in
user enters the code and a board name on the website. The backend then creates the board,
generates a token, and delivers it to the bridge exactly once. The bridge saves the token to
its config file and continues connecting to the backend without restarting. If a token is
already present (config file, env var, or flag), the pairing flow is skipped entirely — this
is the path used in dev and CI.

---

## 2. Data layer

### New table: `pairing_codes` (migration `004_pairing.sql`)

```sql
CREATE TABLE pairing_codes (
  code        TEXT PRIMARY KEY,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL,
  claimed_at  TIMESTAMPTZ,
  raw_token   TEXT,
  board_id    TEXT REFERENCES boards(id) ON DELETE CASCADE
);
CREATE INDEX pairing_codes_expires ON pairing_codes (expires_at);
```

`raw_token` is populated when a user claims the code and nulled out after the bridge retrieves
it once. After delivery the plaintext token does not persist anywhere; `boards.token_hash`
holds only its SHA-256 hash.

---

## 3. Backend

### 3.1 New plugin: `src/api/pairing.ts`

Registered in `src/index.ts` alongside the existing API plugins. Requires `@fastify/rate-limit`
(new dependency) registered globally with a high default limit; individual routes narrow it.

#### `POST /api/pairing/request` — unauthenticated

Rate limit: 10 req / min / IP.

- Generates an 8-character code from the charset `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`
  (uppercase letters and digits, excluding `0`, `O`, `1`, `I` to avoid visual ambiguity).
- Inserts a `pairing_codes` row with `expires_at = now() + 10 minutes`.
- Returns `{ code: string, expiresAt: string }`.

#### `POST /api/pairing/claim` — requires auth (`requireAuth` preHandler)

Rate limit: inherits global default.

- Body: `{ code: string, name: string }`.
- Validates: code exists, `expires_at` has not passed, `claimed_at` is null.
- Errors: 404 (not found), 410 (expired), 409 (already claimed), 400 (missing fields).
- Generates `rawToken = randomBytes(32).toString('hex')`, `tokenHash = sha256(rawToken)`.
- Inserts into `boards` (`id = ulid()`, `owner_user_id`, `name`, `token_hash`).
- Updates `pairing_codes`: sets `claimed_at = now()`, `raw_token = rawToken`, `board_id`.
- Returns `{ boardId: string, name: string }`.

#### `GET /api/pairing/:code/token` — unauthenticated

Rate limit: 5 req / min / IP.

Responses:

| Condition | Status | Body |
|---|---|---|
| Code not found or expired | 404 | `{ error: "not found" }` |
| Found, not yet claimed | 200 | `{ status: "pending" }` |
| Found, claimed, `raw_token` present | 200 | `{ status: "claimed", token: string }` — then nulls `raw_token` |
| Found, claimed, `raw_token` null | 200 | `{ status: "consumed" }` |

The bridge treats `consumed` as a fatal error (token was already delivered and lost).

### 3.2 DB schema additions (`src/db/schema.ts`)

Add `PairingCodesTable` interface and extend `Database`:

```ts
export interface PairingCodesTable {
  code: string
  created_at: ColumnType<Date, never, never>
  expires_at: Date
  claimed_at: Date | null
  raw_token: string | null
  board_id: string | null
}
// Database gains: pairing_codes: PairingCodesTable
```

### 3.3 DB query additions (`src/db/queries.ts`)

Four new functions:

- `insertPairingCode(db, { code, expiresAt })` — inserts a new pending code.
- `getPairingCode(db, code)` — returns the row or undefined.
- `claimPairingCode(db, { code, rawToken, boardId })` — sets `claimed_at`, `raw_token`, `board_id`.
- `consumePairingToken(db, code)` — nulls out `raw_token`.

`claimPairingCode` and `consumePairingToken` run inside the claim and delivery handlers
respectively; no explicit transaction is needed since each is a single-row update.

---

## 4. Bridge

### 4.1 Config changes (`cmd/bridge/config.go`)

`Config` gains:

```go
Token string `koanf:"token"`
```

Sources (lowest to highest priority): TOML file → env var `DARTCADE_TOKEN` → `--token` flag.

New helper: `persistToken(path, token string)` — appends `token = "<token>"` to the TOML
file, identical pattern to `persistBridgeID`.

### 4.2 Pairing flow (`cmd/bridge/config.go`)

A new `runPairing(ctx context.Context, cfg Config) (token string, err error)` function:

1. Derives the HTTP base URL from `cfg.BackendURL` by replacing the `wss://` scheme with
   `https://` (or `ws://` → `http://` for dev). Panics if the scheme is unrecognised.
2. `POST {httpBase}/api/pairing/request` → unmarshals `{ code, expiresAt }`.
3. Prints to stderr:
   ```
   Visit <httpBase> and pair this bridge.
   Code: ABCD1234   (expires in 10 min)
   ```
4. Polls `GET {httpBase}/api/pairing/{code}/token` every 2 seconds until:
   - `status == "claimed"`: returns the token.
   - `status == "consumed"`: returns an error (token already delivered to another process).
   - Deadline (derived from `expiresAt`) exceeded: returns an error.
   - Context cancelled: returns the context error.
5. On success, calls `persistToken(cfgPath, token)`.

### 4.3 Startup gate (`cmd/bridge/main.go`)

After `loadConfig`:

```
if cfg.Token == "" {
    token, err := runPairing(ctx, cfg)
    // handle err → log.Fatal
    cfg.Token = token
}
```

The full backend WS URL is constructed as:

```
cfg.BackendURL + "?token=" + cfg.Token
```

and passed as `transport.Config.BackendURL`. (Currently the caller supplies the full URL;
this moves construction into `main.go`.)

---

## 5. Frontend

### 5.1 Pairing modal (`frontend/src/routes/Boards.svelte`)

The existing "Pair new board" button opens an inline modal (no new route or component file).
State: `pairOpen bool`, `pairCode string`, `pairName string`, `pairError string | null`,
`pairLoading bool`.

**Modal content:**

- Instruction text: "Run `dartcade-bridge` on your board's machine, then enter the code it displays."
- Code input: text field, auto-uppercased, trimmed to 8 characters.
- Name input: board display name.
- Submit button → `POST /api/pairing/claim` with `{ code, name }`.
  - On 200: close modal, re-fetch `/api/boards`, show board in list.
  - On 404/410/409: show inline error message.
- Cancel button closes the modal.

---

## 6. Security

| Defence | Detail |
|---|---|
| Rate limiting | `/api/pairing/request`: 10/min/IP. `/api/pairing/:code/token`: 5/min/IP. |
| Short expiry | Codes expire after 10 minutes. |
| One-time delivery | `raw_token` is nulled out after the first successful delivery poll. |
| Code entropy | 8 chars × 32-symbol alphabet ≈ 10¹² combinations; impractical to brute-force within 10 min at 5 req/min. |
| Token storage | Only SHA-256 hash persisted in `boards`; plaintext exists only in `pairing_codes.raw_token` for the window between claim and delivery. |

---

## 7. Files touched

| File | Change |
|---|---|
| `backend/src/db/migrations/004_pairing.sql` | new |
| `backend/src/db/schema.ts` | add `PairingCodesTable`, extend `Database` |
| `backend/src/db/queries.ts` | 4 new query functions |
| `backend/src/api/pairing.ts` | new plugin (3 routes) |
| `backend/src/index.ts` | register `@fastify/rate-limit` + pairing plugin |
| `backend/package.json` | add `@fastify/rate-limit` |
| `bridge/cmd/bridge/config.go` | `Token` field, `runPairing`, `persistToken` |
| `bridge/cmd/bridge/main.go` | token gate, construct WS URL |
| `backend/frontend/src/routes/Boards.svelte` | pairing modal |
