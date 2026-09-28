# E2E Smoke Test Suite — Design

**Date:** 2026-09-28
**Branch:** feat/e2e-tests
**Status:** Draft

---

## Goal

Catch broken user flows before they merge to main. Not a substitute for unit/integration tests — those cover game logic. This suite covers the rendered UI and the wiring between frontend, backend, and database.

---

## Scope

### In scope (smoke tests — run on every PR)
- Auth: register, login, logout
- Boards: list renders
- CreateSession: manual-only session creation through to the game display
- ATC game: manual dart entry advances score
- X01 game: manual dart entry, bust state renders correctly

### Out of scope
- Board-connected flows (no bridge in this suite)
- Full game completion flows (integration tests cover scoring rules)
- Camera tiles (flaky without real hardware)

### Future: nightly extended suite
Add a `--no-delay` flag to `bridge replay` and a separate nightly workflow to cover board-driven flows (full ATC/X01 via JSONL replay). Not part of this implementation.

---

## Framework & Location

**Playwright** (`@playwright/test`) — handles Svelte SPA routing, WebSocket-driven UI, and headless Chromium in CI without extra config.

Location: `e2e/` at the repo root (alongside `backend/`, `bridge/`).

```
e2e/
  playwright.config.ts       # base URL, retries, workers
  global-setup.ts            # start docker-compose, wait for health
  global-teardown.ts         # docker-compose down
  fixtures/
    auth.ts                  # logged-in page fixture (creates user, logs in once per worker)
  tests/
    auth.spec.ts
    boards.spec.ts
    create-session.spec.ts
    game-atc.spec.ts
    game-x01.spec.ts
```

---

## Test Environment

`docker-compose.e2e.yaml` — postgres + backend + frontend. No bridge service.

```yaml
# docker-compose.e2e.yaml
services:
  postgres:   # same as dev
  backend:    # NODE_ENV=test, TEST_DATABASE_URL
  frontend:   # BACKEND_HOST=backend
```

Playwright's `globalSetup` runs `docker compose -f docker-compose.e2e.yaml up -d --wait` (compose v2 `--wait` honours healthchecks). `globalTeardown` runs `docker compose -f docker-compose.e2e.yaml down -v`.

Tests hit `http://localhost:5173` (frontend) and `http://localhost:3000` (backend API directly for setup).

---

## Auth Fixture

Creating a user and logging in is a prerequisite for every test except `auth.spec.ts`. Rather than driving the UI for every test, the `auth` fixture:
1. `POST /api/auth/sign-up` via `request` (Playwright API context — no browser needed)
2. Saves the session cookie into browser storage state
3. Reuses storage state across tests in the same worker

Each worker gets its own unique email (`worker-{n}-{timestamp}@test.local`) so tests run in parallel without collisions.

---

## Test Specs

### `auth.spec.ts`
- Register with a new email → redirected to Boards
- Login with wrong password → error message shown
- Login → Logout → redirected to Login page

### `boards.spec.ts`
- After login, Boards page shows the heading and the "New session" button
- _(No board rows expected in CI — just asserts the page renders without error)_

### `create-session.spec.ts`
- Open CreateSession, select "Manual only", add two players, submit
- Assert: redirected to GameDisplay, player names visible, session is active

### `game-atc.spec.ts`
- Start a 2-player ATC session (manual)
- Enter a dart via the manual entry panel (e.g. S1)
- Assert: dart appears in the throw tracker, score updates

### `game-x01.spec.ts`
- Start a 2-player X01 501 session (manual)
- Enter darts until the remaining score is low (e.g. 3 left), then throw a dart that exceeds it (S4) to trigger a bust
- Assert: bust state indicator rendered (red score / bust badge)

---

## CI Integration

New job `test-e2e` in `.github/workflows/ci.yml`. Runs after (or in parallel with) the existing unit test jobs — it is independent.

```yaml
test-e2e:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: jdx/mise-action@v2
    - run: npm ci
      working-directory: e2e
    - run: npx playwright install --with-deps chromium
      working-directory: e2e
    - run: npm test
      working-directory: e2e
```

Docker Compose is available on GitHub-hosted `ubuntu-latest` runners. No additional service blocks needed — Playwright's globalSetup handles compose lifecycle.

---

## mise tasks

```toml
[tasks."test:e2e"]
description = "Run e2e smoke tests"
run = "cd e2e && npm test"
```

---

## Error Handling & Flakiness

- Playwright retries: 1 retry on CI, 0 locally
- `globalSetup` polls backend `/health` with a 60-second timeout before starting tests
- Each test is independent — no shared state between specs (auth fixture scoped per-worker)
- No `page.waitForTimeout` — use `waitForSelector` / `waitForURL` / `expect.toBeVisible` with Playwright's auto-retry

---

## What Is Not Covered

- Bridge-connected flows → nightly suite (future)
- Game completion / winner screen → covered by backend integration tests
- Sound and animation → not testable headlessly
- Mobile viewports → out of scope for now
