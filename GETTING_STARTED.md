# Getting started

Two pieces: the **app** (backend + database, one deployment for everyone who plays) and the
**bridge** (a small binary next to each physical board, talking to its Board Manager).

## 1. Get the app

**Use the official instance at [play.dartca.de](https://play.dartca.de).** Open it, create an
account and you're ready: nothing to deploy yourself. Then continue with step 2.

Want your own instance instead (your data, your network)? Self-host it with Docker: see
[`docs/SELFHOSTING.md`](docs/SELFHOSTING.md), and use your own address wherever the steps below
say `play.dartca.de`.

## 2. Install the bridge

On the machine next to your board (often the board PC itself), Linux or macOS, amd64 or arm64:

```bash
curl -fsSL https://raw.githubusercontent.com/W3D3/dartcade/main/scripts/install-bridge.sh | sh
```

This installs `dartcade-bridge` to `/usr/local/bin`. Windows: download the `.exe` from
[Releases](https://github.com/W3D3/dartcade/releases) instead. A Docker image is also published
as `ghcr.io/w3d3/dartcade-bridge`.

### Keep it running (Linux)

To start the bridge at boot and bring it back after a crash or a restart, install it as a systemd
service. Pass the Board Manager's address (it defaults to `http://localhost:3180`, for a board on
the same machine):

```bash
curl -fsSL https://raw.githubusercontent.com/W3D3/dartcade/main/scripts/install-bridge.sh | sh -s -- --service --board-url http://<board-ip>:3180
```

The script installs and starts the service and prints the pairing code (step 3 below, no need to run
the bridge by hand). Run it again to upgrade or to change a setting; `--token`, `--backend-url` and
`--board-url` are kept between runs. Logs: `journalctl -u dartcade-bridge -f`. Remove it with
`... | sh -s -- --uninstall` (add `--purge` to forget the pairing too).

## 3. Run the bridge and pair a board

```bash
dartcade-bridge --board-url http://<board-ip>:3180 --backend-url wss://play.dartca.de
```

With no token configured yet, it prints a pairing code such as `7KQ4-M2XD`. In dartcade, open
**Settings → Boards**, enter the code and give the board a name. The bridge saves its token
and reconnects automatically from then on — run `dartcade-bridge --help` for all options.

## Next

- [`DEVELOPMENT.md`](DEVELOPMENT.md): run dartcade from source, with hot reload.
- [`ARCHITECTURE.md`](ARCHITECTURE.md): how the bridge, backend and frontend fit together.
