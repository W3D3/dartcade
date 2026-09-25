# dartcade

Custom dart minigames for physical boards running [Autodarts](https://autodarts.io).

See [`docs/architecture.md`](docs/architecture.md) for the design and [`DEVELOPMENT.md`](DEVELOPMENT.md) to get started.

## What's built

- **`bridge/`** — Go binary that connects to an Autodarts Board Manager, diffs state snapshots into typed events (`adbridge/v1`), and streams them to the backend over WSS with seq/ack delivery.
- **`backend/`** — Node/TypeScript Fastify server:
  - Bridge WebSocket gateway (auth, dedup, event log in Postgres)
  - Session engine (event-sourced, rebuilds from Postgres on startup)
  - Around the Clock (ATC) game module — fully configurable, TDD-tested
  - Browser WebSocket gateway (snapshot push, user actions)
  - REST API (`/api/sessions`, `/api/games`, `/health`)
  - Multi-stage Docker image serving the SPA from the same process
- **`backend/frontend/`** — Svelte 5 SPA:
  - Create session (game picker, ATC config, player names)
  - Live game display (dart board SVG, player list, correction panel)
  - WebSocket store with exponential-backoff reconnect

## Status

Backend and frontend v1 complete on `feat/backend`. Bridge spike done; full bridge implementation in progress.
