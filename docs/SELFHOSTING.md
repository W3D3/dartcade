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

- `TRUST_PROXY` — set to `1` behind one reverse proxy, so rate limits count each client, not the proxy
- `VOICE_STORAGE_LIMIT_MB` — caller voice pack storage per user, in MB (default `50`)
- `BOARD_LIVE_CAMERA` — set to `off` if the backend can't reach your boards' network (e.g. a
  cloud host) or anyone can sign up: the backend then never calls a Board Manager itself, so the
  Boards page loses the live camera preview, the board status and the Start/Stop/Reset/Calibrate
  buttons (games are not affected)

**Admins** (the minigolf course editor, features still behind a flag) are users with
better-auth's `admin` role. Sign up, then give your account the role in the database:

```bash
docker compose exec postgres psql -U dartgames -d dartgames \
  -c "UPDATE \"user\" SET role = 'admin' WHERE email = 'you@example.com'"
```

Once it's up, continue with [`GETTING_STARTED.md`](../GETTING_STARTED.md) to install the bridge
and pair a board.
