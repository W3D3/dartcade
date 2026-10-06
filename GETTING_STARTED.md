# Getting started

Two pieces to stand up: the **app** (backend + database, one deployment for everyone who plays)
and the **bridge** (a small binary next to each physical board, talking to its Board Manager).

## 1. Get the app

**Hosted dartcade is in progress** — a ready-to-use instance with nothing to deploy yourself.
Until it's out, self-host it with Docker: see [`docs/SELFHOSTING.md`](docs/SELFHOSTING.md).

## 2. Install the bridge

On the machine next to your board (often the board PC itself), Linux or macOS, amd64 or arm64:

```bash
curl -fsSL https://raw.githubusercontent.com/W3D3/dartcade/main/scripts/install-bridge.sh | sh
```

This installs `dartcade-bridge` to `/usr/local/bin`. Windows: download the `.exe` from
[Releases](https://github.com/W3D3/dartcade/releases) instead. A Docker image is also published
as `ghcr.io/w3d3/dartcade-bridge`.

## 3. Run the bridge and pair a board

```bash
dartcade-bridge --board-url http://<board-ip>:3180 --backend-url wss://<your-dartcade-host>
```

With no token configured yet, it prints a pairing code such as `7KQ4-M2XD`. In dartcade, open
**Boards → Pair a board**, enter the code and give the board a name. The bridge saves its token
and reconnects automatically from then on — run `dartcade-bridge --help` for all options.

## Next

- [`DEVELOPMENT.md`](DEVELOPMENT.md): run dartcade from source, with hot reload.
- [`ARCHITECTURE.md`](ARCHITECTURE.md): how the bridge, backend and frontend fit together.
