# Self-hosting dartcade

You need a host that can run Docker and reach the internet (or your boards' network, for the
live camera preview — see `BOARD_LIVE_CAMERA` below).

Create a `docker-compose.yaml`:

```yaml
services:
  backend:
    image: ghcr.io/w3d3/dartcade:latest
    ports:
      - '3000:3000'
    environment:
      DATABASE_URL: postgres://dartgames:${POSTGRES_PASSWORD}@postgres:5432/dartgames
      BRIDGE_SECRET: ${BRIDGE_SECRET}
    depends_on:
      postgres:
        condition: service_healthy
  postgres:
    image: postgres:16-alpine
    volumes:
      - pg_data:/var/lib/postgresql/data
    environment:
      POSTGRES_DB: dartgames
      POSTGRES_USER: dartgames
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U dartgames']
      interval: 5s
      timeout: 5s
      retries: 5
volumes:
  pg_data:
```

Then run it:

```bash
POSTGRES_PASSWORD=<something-secret> BRIDGE_SECRET=<something-secret> docker compose up -d
```

Put it behind a reverse proxy with TLS (e.g. Caddy or nginx) so the frontend and bridges can
reach it over `https://`/`wss://`. Env vars worth knowing about (all optional, see
[`DEVELOPMENT.md`](../DEVELOPMENT.md#environment-variables) for the full list):

- `VOICE_STORAGE_LIMIT_MB` — caller voice pack storage per user, in MB (default `50`)
- `BOARD_LIVE_CAMERA` — set to `off` if the backend can't reach your boards' network (e.g. a
  cloud host); turns off the owner's live camera preview on the Boards page only

Once it's up, continue with [`GETTING_STARTED.md`](../GETTING_STARTED.md) to install the bridge
and pair a board.
