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
      BETTER_AUTH_SECRET: ${BETTER_AUTH_SECRET}
      BETTER_AUTH_URL: ${BETTER_AUTH_URL}
      BETTER_AUTH_TRUSTED_ORIGINS: ${BETTER_AUTH_TRUSTED_ORIGINS}
      ADMIN_EMAIL: ${ADMIN_EMAIL}
      ADMIN_PASSWORD: ${ADMIN_PASSWORD}
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
POSTGRES_PASSWORD=<something-secret> BRIDGE_SECRET=<something-secret> \
BETTER_AUTH_SECRET=<something-secret> BETTER_AUTH_URL=https://dartcade.example.com \
BETTER_AUTH_TRUSTED_ORIGINS=https://dartcade.example.com \
ADMIN_EMAIL=you@example.com ADMIN_PASSWORD=<something-secret> \
docker compose up -d
```

| Variable                        | Required    | Description                                                                                      |
| ------------------------------- | ----------- | ------------------------------------------------------------------------------------------------ |
| `POSTGRES_PASSWORD`             | Yes         | Postgres's password for the `dartgames` user                                                     |
| `BRIDGE_SECRET`                 | Yes         | Shared secret the bridge authenticates with                                                      |
| `BETTER_AUTH_SECRET`            | Yes         | Signs and encrypts sessions and cookies (better-auth); any long random string                    |
| `BETTER_AUTH_URL`               | Yes         | This dartcade's public URL, e.g. `https://dartcade.example.com`                                  |
| `BETTER_AUTH_TRUSTED_ORIGINS`   | Yes         | Comma-separated origins allowed to sign in; your public URL (add more for a staging domain, say) |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | First start | Creates the first admin account on startup (at least 8 characters) — see "First start" below     |

Put it behind a reverse proxy with TLS (e.g. Caddy or nginx) so the frontend and bridges can
reach it over `https://`/`wss://`. More env vars worth knowing about (all optional, see
[`DEVELOPMENT.md`](../DEVELOPMENT.md#environment-variables) for the full list):

- `TRUST_PROXY` — set to `1` behind one reverse proxy, so rate limits count each client, not the proxy
- `PUBLIC_URL` — the address the app is reached at, e.g. `https://darts.example.com`, so shared links show a preview image
- `VOICE_STORAGE_LIMIT_MB` — caller voice pack storage per user, in MB (default `50`)
- `BOARD_LIVE_CAMERA` — set to `off` if the backend can't reach your boards' network (e.g. a
  cloud host) or anyone can sign up: the backend then never calls a Board Manager itself, so the
  Boards page loses the live camera preview, the board status and the Start/Stop/Reset/Calibrate
  buttons (games are not affected)

**Admins** (the minigolf course editor, features still behind a flag) are users with
better-auth's `admin` role. The first one comes from `ADMIN_EMAIL`/`ADMIN_PASSWORD` (see "First
start"), and admins promote others on `#/admin/users`. Without those variables, sign up, then give
your account the role in the database:

```bash
docker compose exec postgres psql -U dartgames -d dartgames \
  -c "UPDATE \"user\" SET role = 'admin' WHERE email = 'you@example.com'"
```

## First start

What happens the first time this comes up, in order:

1. The backend starts, runs its migrations, and sees that no account has `role = 'admin'`. It
   creates the account `ADMIN_EMAIL` with `ADMIN_PASSWORD` and the admin role, and logs one line
   saying so (never the password). If an account with `ADMIN_EMAIL` already exists, it's promoted
   only when `ADMIN_PASSWORD` signs into it; otherwise the backend logs an error and leaves it
   alone, and you promote it with the SQL above.
2. Sign in with that account. There's no in-app way to change a password yet (a planned
   follow-up), so pick a long, random `ADMIN_PASSWORD` up front and keep it in your secret
   store — it stays this account's password.
3. On `#/admin/users`, promote anyone else who should be an admin.
4. On `#/admin/flags`, turn features on for admins, chosen users or everyone — changes apply at
   once, with no restart.
5. Once you've signed in, remove `ADMIN_EMAIL` and `ADMIN_PASSWORD` from the container's env:
   `ADMIN_PASSWORD` is the account's live password, and anyone who can run `docker inspect` on the
   host can read it. Once any admin exists they do nothing; you only need them again to recover
   from a lockout.

**Locked out** (no admin can sign in): clear the role from every admin
(`UPDATE "user" SET role = NULL WHERE role = 'admin'`) and restart with `ADMIN_EMAIL` and
`ADMIN_PASSWORD` set, so the first-start rules above run again. Or give an account the role
directly with the SQL above.

Once it's up, continue with [`GETTING_STARTED.md`](../GETTING_STARTED.md) to install the bridge
and pair a board.
