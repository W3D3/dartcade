<p align="center">
  <img src="backend/frontend/public/favicon.svg" alt="dartcade logo" width="96" height="96">
</p>

<h1 align="center">dartcade</h1>

<p align="center">
  <strong>Your Autodarts board, more games, your friends anywhere.</strong>
</p>

<p align="center">
  <a href="https://github.com/W3D3/dartcade/actions/workflows/ci.yml"><img src="https://github.com/W3D3/dartcade/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
</p>

---

dartcade turns a board running [Autodarts](https://autodarts.io) into an arcade. Throw, and the
darts land on the screen. Play the classics or modes Autodarts doesn't have, with your own rules.
Play side by side at one board, or against friends at their own boards across town, from a laptop
or straight from your phone. No board at hand? Tap your darts in and play anyway.

## Features

### Games

- **X01**: 301, 501, 701 or any start score. Straight, double or master in and out, 25/50 or 50/50
  bull, first to N legs, a round limit. Play singles, or Team A against Team B sharing one score.
- **Around the Clock**: 1–20 ascending, descending or in random order, finish on 20, the single
  bull or the bull, with optional multiplier skips and "throw again" when all three darts hit.
- **Bull off** to decide who throws first, the WDC or PDC way.

### Playing

- **Hands-free on your board.** Darts count as they land, and pulling them out moves on to the
  next player.
- **Or enter darts yourself.** Tap where the dart landed on the board, with long-press zoom for
  the exact spot, or use the keypad. dartcade remembers which one you like.
- **Fix a misdetected dart**: tap it and pick the right one, or drag it to where it really landed.
- **A match screen that reads from the oche**: big scores, averages, a chalkboard of every
  visit, checkout suggestions, leg dots and optional sounds.
- **A caller for X01** that calls every visit, the bust and the game shot. It comes with a
  built-in English voice, "English (Adam)", generated with
  [Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M) (Apache-2.0; see
  [its license](backend/frontend/public/voices/en-adam/LICENSE.md)). Import your own voice packs
  (a darts-caller zip, or a link to one) in Settings; they live on your account, ready on every
  board and device.
- **Made for phones too.** A match fits an iPhone screen, keypad included, without scrolling.

### Playing together

- **Several players at one board**, taking turns.
- **Every game runs in a lobby.** Playing alone is a lobby with just you in it, and it stays out
  of the way until someone else joins. Invite a friend by `@username`, or share the lobby's code,
  link or QR code; your lobby stays open between games and keeps your settings. Everyone marks
  themselves ready before the host starts, and the lobby's feed shows who joined, who won and
  what changed.
- **Friends on their own devices.** Once they're in your lobby, they join from their phone or
  laptop, throwing on their own board or using manual entry.
- **Always know what's going on.** Each player's board on screen, a live view of whoever is
  throwing, a clear "waiting for…" if someone drops out, and a fallback to manual entry when a
  board goes offline.
- **Fair play built in.** Only you can throw for your seat, and a dart thrown out of turn on your
  board doesn't count. The host can end a game for everyone; anyone else leaves, forfeiting
  their own seats.

### Boards and history

- **Pair a board with a code.** Start the bridge next to the board, type the code it shows, done.
- **Run the board from dartcade**: Board Manager status, start, stop, reset, calibrate and a
  camera preview.
- **Every game kept**, with results and stats to look back on.

<p align="center">
  <img src="docs/board-pairing/02-ready.png" alt="Pairing a board in dartcade" width="360">
</p>

## Coming next

- **Friends**, then **matchmaking** with ratings.
- **More minigames**, such as soccer and challenge modes.

## Learn more

- [`DEVELOPMENT.md`](DEVELOPMENT.md): run it yourself, connect a board, run the tests.
- [`ARCHITECTURE.md`](ARCHITECTURE.md): how the bridge, backend and frontend fit together.

dartcade is [MIT licensed](LICENSE).
