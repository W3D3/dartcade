# Feature flags: design

Minigolf is playable but not ready for everyone. Put it behind a feature flag so admins can play it
in production while others don't see it, using OpenFeature on both ends.

## Decisions

- **OpenFeature on both ends, the backend decides.** The backend evaluates flags with
  `@openfeature/server-sdk` and its built-in `InMemoryProvider`; it serves them to the SPA over the
  OpenFeature Remote Evaluation Protocol (OFREP). The SPA uses `@openfeature/web-sdk` with
  `@openfeature/ofrep-web-provider`. One source of truth, standard APIs on both sides, and a later
  move to a hosted provider (flagd, a SaaS) only swaps providers.
- **Flags are evaluated per user.** The evaluation context is the signed-in user (`targetingKey` =
  user id, `email`, `admin`), always built on the server from the session; context the browser sends
  is ignored, so nobody can turn a flag on by claiming to be an admin.
- **First flag: `gamemode.minigolf.enabled`** (boolean). On for admins, off for everyone else.
- **Per-deployment override:** `FLAGS_ON` (comma-separated keys) turns flags on for everyone in a
  deployment (e.g. the PR preview, or production once Minigolf ships). Removing the flag later is a
  code change, not a config one.
- **No OFREP server library exists for Fastify** (the npm hits are hosted flag services or a
  Cloudflare Workers handler), so the backend serves the two OFREP routes itself, typed with
  `@openfeature/ofrep-core`'s request/response types (the web provider's own dependency).

## Backend

- `backend/src/flags/definitions.ts`: the flags as `InMemoryProvider` flag configuration, each with
  `variants`, `defaultVariant` and a `contextEvaluator` (the targeting rule). `FLAGS_ON` forces the
  `on` variant.
- `backend/src/flags/index.ts`: registers the provider at startup (`OpenFeature.setProviderAndWait`),
  `contextFor(user)` builds the evaluation context, `flagEnabled(key, user)` evaluates one boolean
  flag (for the game rules below), `evaluateAll(user)` evaluates every flag (for OFREP).
- `backend/src/api/ofrep.ts` (OFREP v1):
  - `POST /ofrep/v1/evaluate/flags`: bulk evaluation, `{ flags: [{ key, value, reason, variant }] }`.
    This is what the web provider calls.
  - `POST /ofrep/v1/evaluate/flags/:key`: one flag; unknown key → 404 `{ key, errorCode:
    'FLAG_NOT_FOUND' }`.
  - Signed out: evaluated with an anonymous context (every flag off), not 401, so the provider
    initialises on the login page too. Responses carry an `ETag`; a matching `If-None-Match` gets 304
    (the web provider supports it).
  - Documented in `schema/api-v1.yaml` like every other route.
- **Minigolf gated where games are chosen and started**, for the user choosing (the lobby host):
  - `GET /api/gamemodes` leaves out a mode whose `gamemode.<id>.enabled` flag is off for the viewer.
  - Saving the lobby's next game or starting a game with a mode that's off → 409
    `{ error: 'That game isn't available' }`.
  - Games already running, the history and match details, and the admin bench stay reachable: the flag
    hides a mode from being picked, it doesn't break games that exist.
- Only modes that have a flag are gated (`gamemode.<id>.enabled` exists in the definitions); X01 and
  ATC have none and are always on.

## Frontend

- `backend/frontend/src/lib/flags.ts`: sets the OFREP web provider (base URL: the app's origin) once
  at startup; after sign-in, sign-out and the dev user switch it refetches (`OpenFeature.setContext`
  with the user id, so the provider re-evaluates and the cache key changes). `flag(key)` returns a
  readable Svelte store of the boolean value that updates on the provider's change events.
- The Play page's mode tiles: a mode is shown when the backend lists it (already the rule) and its
  flag is on; the flag check keeps a stale `gamemodes` response from showing it after a sign-out.

## Testing

- Flags: `gamemode.minigolf.enabled` on for an admin, off for a non-admin and signed out, on for
  everyone with `FLAGS_ON=gamemode.minigolf.enabled`.
- OFREP: bulk and single evaluation shapes, 404 for an unknown key, the browser's context ignored,
  304 on a matching ETag.
- Gating: `GET /api/gamemodes` without Minigolf for a non-admin; saving/starting Minigolf as a
  non-admin host → 409; an admin can.
- Frontend: `flag()` follows provider change events (provider stubbed).
- e2e: the existing minigolf e2e signs in as the e2e admin (it already has `ADMIN_EMAILS`); a
  non-admin doesn't see the Minigolf tile.

## Out of scope

A flag admin UI, percentage rollouts, flags in the lobby or game sockets, a hosted flag service.
