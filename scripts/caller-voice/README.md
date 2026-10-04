# Caller voice generator

Generates the built-in "English (Adam)" caller voice shipped at
`backend/frontend/public/voices/en-adam/`. This is a one-off developer tool: it is not
one of the app's dependencies and its output (small MP3 clips + a manifest) is what the
app actually ships, not this script or its model weights.

It uses [Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M) (Apache-2.0 weights)
through [`kokoro-js`](https://www.npmjs.com/package/kokoro-js) (Apache-2.0), voice
`am_adam`, run entirely on CPU, no network calls beyond the first model download.

## Setup

```sh
cd scripts/caller-voice
npm install
```

This downloads `kokoro-js` and the ONNX model (`onnx-community/Kokoro-82M-v1.0-ONNX`,
q8 quantised, a few hundred MB) into `node_modules/@huggingface/transformers/.cache`.
It only needs to happen once; re-running `generate.mjs` reuses the cached model.

You also need Nix: the script trims and encodes with ffmpeg, which it always runs as
`nix shell nixpkgs#ffmpeg -c ffmpeg ...` (an `ffmpeg` on your `PATH` isn't used). To fetch
it into the Nix store once, ahead of the first run:

```sh
nix shell nixpkgs#ffmpeg -c ffmpeg -version
```

## Running

```sh
cd scripts/caller-voice
node generate.mjs
```

This reads `lines.json` (the lines per key — darts scores 0-180, `gameshot`/`matchshot`/
`busted`/`gameon` variants, `leg_1`…`leg_15`, `bulling_start`), synthesises each line with
Kokoro, and for every clip:

1. Trims leading/trailing silence (`silenceremove`).
2. Normalises loudness so every clip is at a consistent level (`loudnorm`).
3. Downmixes to mono and encodes to a small MP3 (~48 kbps, 22.05 kHz).

Output goes to `backend/frontend/public/voices/en-adam/`: one `<key>.mp3` per key with a
single line, or `<key>-1.mp3`, `<key>-2.mp3`, … for keys with several variants, plus a
`manifest.json` listing them (`{ id, name, clips: { "<key>": ["<file>.mp3", …] } }`).

After running, check the total folder size (target: well under 3 MB) and spot-listen to
a few clips — especially the shortest and longest — since nothing here verifies that the
model's output actually sounds right.

## Editing the lines

Edit `lines.json` and re-run `node generate.mjs`; it regenerates every clip (there's no
incremental mode — a full run takes a few minutes on CPU). Keep the key names in sync
with what the app's caller expects (see `backend/frontend/src/lib/caller/`).
