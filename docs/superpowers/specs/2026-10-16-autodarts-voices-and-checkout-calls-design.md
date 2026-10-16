# Autodarts voices and checkout calls: design

Two caller features that meet at the "you require N" clips:

1. **Checkout calls** ([#132](https://github.com/W3D3/dartcade/issues/132)): in X01 the caller says
   "You require 121" when the next thrower can finish. For everyone, with its own caller toggle.
2. **Autodarts voice import**: a player imports Autodarts' caller voices (Dotty English, Dotty German,
   Hware English) from files they saved themselves while logged in to play.autodarts.com. Behind the
   `caller.autodartsImport` flag.

Builds on the caller voice packs design (`2026-10-04-caller-voice-packs-design.md`).

## Decisions

- **Nothing from Autodarts goes in the repo**: no audio and no timing tables. The player brings both
  the MP3 and its timing table, taken from the same Autodarts deploy, so a new Autodarts version can't
  leave us with a stale table.
- **A bookmarklet fetches them.** Autodarts answers 403 to anything but a logged-in browser, so the
  files are taken in the player's own Autodarts tab. Dartcade's server never fetches from Autodarts
  and never runs or parses Autodarts code.
- **Stored like any imported pack**: per account on the server (`voice_packs`, `voice_clips`),
  owner-only, counted against `VOICE_STORAGE_LIMIT_MB`.
- **Cut, not re-encoded.** The server cuts the MP3 on its own frame boundaries. No decoder, no encoder,
  no new dependency. Clips stay 128 kbps stereo: about 10 MB per voice, about 30 MB for all three.
- **The player trims edge silence** after decoding, for every pack. It covers Autodarts' padding
  (Hware has about 0.2 s before and 0.35 s after each clip) and the frames added for the bit reservoir.
- **Keys**: `require_N` (N 1–180) is the whole "You require N" phrase, as Autodarts and our reference
  packs name it; `you_require` is a lead-in clip followed by the number clip.
- **en-adam gets `require_1`–`require_180` and `you_require`**, generated with the existing Kokoro
  pipeline.
- **Feasibility is `canCheckOut`**, not "is there a hint": hiding hints must not silence the caller.
- **Out of scope**: player names ("Chris, you require…"), Around the Clock calls, a lobby-wide voice
  (all still "Later" in the voice packs design).

## Checkout calls

### When

`callsFor(before, after)` (`backend/frontend/src/lib/caller/calls.ts`) adds the call when a visit is
committed: the score call as today, then, if the next thrower can finish, the require call.

- "Can finish" is `canCheckOut(remaining, config.outMode)`; the remaining score is the team's score
  in team games.
- Only after a committed visit: never at game on or at the start of a leg, and not after a game shot
  or match shot.
- A correction that changes a committed visit is not re-announced (as today).

`CallGame` gains the out mode (`config.outMode` is already in the snapshot).

### `canCheckOut` and the 180 cap

`backend/src/shared/checkout.ts`:

- `checkoutHint` returns `null` above 170 in every mode. That is right for double out but wrong for
  straight and master out, where 171, 174, 177 and 180 finish (T20 T20 T20). The cap becomes 170 for
  double out, 180 otherwise. The hint panel and the checkout-attempt stats get these scores too.
- New `canCheckOut(remaining, outMode)`: `checkoutHint(remaining, outMode, 3) !== null`. `x01.ts:376`
  (checkout attempts, one dart left) uses `checkoutHint(…, 1) !== null` today and stays as is: it asks
  about one dart, not three. Only the caller uses `canCheckOut` in this change.

The hint toggle (`suggest` in `dartSlots.ts`, `playerStats.ts`) only decides whether the UI shows
hints. It doesn't affect `canCheckOut`.

### Settings

In `lib/gameSettings.ts`, next to `callerOn`, both in `ACCOUNT_KEYS` like it:

- `callerCheckouts` (default on): say checkout calls.
- `callerCheckoutRepeat` (default on): when off, skip the call if that seat's remaining score is the
  one last announced for it (after a bust or a no-score visit). This memory lives in `createCaller`,
  per game; `callsFor` stays pure.

Shown under Caller in Settings (`CallerDefaults.svelte`) and the in-game drawer
(`SettingsDrawer.svelte`), only while the caller is on.

### Which clips play

The pack's own voice first; one sentence never mixes two voices.

1. The pack's `require_N`.
2. The pack's `you_require`, then its `N`.
3. en-adam's `require_N` (the whole phrase, borrowed through the existing fallback to the default
   voice).
4. Nothing.

Today a `Call` is a list of parts, each a list of keys by preference, and `voiceClips` lays the pack
over en-adam. That can't say "this clip, or those two" and can't tell a pack's own clip from a
borrowed one. The change:

- A call can list alternatives: `pickClips` plays the first alternative whose every part resolves.
- `mergeClips` never borrows `you_require` (like `and` today), and doesn't borrow `require_N` when the
  pack has its own `you_require`, so step 2 wins over step 3.

The exact type is left to the plan; `pickClips`' existing callers keep working.

### Keys accepted on import

`isCallerKey` (`backend/src/caller/pack.ts`) also accepts `require_N` (N 1–180) and `you_require`.
`keyFromName` maps `you-require`, `you require` to `you_require`. The `pack.test.ts` assertion that
rejects `you_require` flips.

### en-adam

`scripts/caller-voice/lines.json` gains `"you_require": ["You require"]` and
`"require_N": ["You require N"]` for N 1–180, generated and normalised like the other clips (Kokoro,
then one ffmpeg pass) and committed to `backend/frontend/public/voices/en-adam/` with the manifest.
About 180 clips, about 0.9 MB.

## Autodarts voice import

### What Autodarts serves

- Each voice is one long MP3: 48 kHz stereo, 128 kbps CBR (a 64 kbps `Info` frame first), 570–685 s,
  9–11 MB, served as `/assets/<voice>-<hash>.mp3` (`dotty-floor-english`, `dotty-floor-german`,
  `hware-floor-english`).
- It is an audio sprite. The clip offsets live in a JS chunk next to it,
  `/assets/<voice>-<hash>.js`: the default export maps `"1"`…`"180"` to `[offsetMs, durationMs]`
  (only some scores exist), and `game_on`, `game_shot`, `game_shot_match`, `"0"` and each `require_N`
  are separate exports.
- Clip counts seen: Dotty English 346, Dotty German 346, Hware English 358.

### The bookmarklet

`backend/frontend/src/lib/caller/autodartsBookmarklet.ts` holds the source as a readable function;
the `javascript:` URL is built from it (`Function.prototype.toString`, URI-encoded), so the guide's
button and its copyable console version are the same code. It contains a file-name pattern, no
Autodarts data.

Run on play.autodarts.com, it:

1. Reads the page's same-origin JS (entry scripts, modulepreloads, every loaded chunk) and finds
   `(dotty|hware)-floor-(english|german)-<hash>.(mp3|js)`, resolving each name against the file it was
   found in.
2. Loads each voice's chunk with `import()` (it runs in Autodarts' own page) and collects the default
   score map plus every export that is a `[number, number]` pair.
3. Fetches the MP3 and downloads two files under Autodarts' own names:
   - `<voice>-<hash>.mp3`, unchanged;
   - `<voice>-<hash>.json`:
     `{ "voice": "dotty-floor-english", "mp3": "dotty-floor-english-<hash>.mp3", "mp3Bytes": 9316345, "unit": "ms", "sprite": { "1": [0, 654], … } }`.
4. Shows how many clips each voice had, or what went wrong (the details are in the console).

Tried by hand against play.autodarts.com in Chrome on 2026-10-16: it finds all three voices and
`import()` is allowed.

### The guide

In the Caller voices card (`CallerVoices.svelte`), only when `caller.autodartsImport` is on, an
"Import Autodarts voices" section:

1. Drag the **Get Autodarts voices** button to your bookmarks bar.
2. Open play.autodarts.com, logged in, and click it. If a voice is missing, play it once in Autodarts
   first.
3. Drop the `.mp3` and `.json` files here.

A disclosure below holds the same code to paste into the browser console, for browsers that block
bookmarklets.

### Upload

The existing drop zone and file input take several files at once. With the flag on, `.mp3` and
`.json` files are accepted next to `.zip`. Each `.json` is paired with the MP3 it names (`mp3`); a
pair goes to the server as one import, with the same progress and cancel as a zip. A JSON without its
MP3, or the other way round, is reported before anything is uploaded.

On the server, `api/voices.ts` takes the pair (the transport, e.g. multipart or a second route, is
left to the plan) and refuses it with 404 when `caller.autodartsImport` is off for the user. The
existing limits apply (one import at a time per user, two across the server, size caps, quota).

### Cutting (`backend/src/caller/autodarts.ts`, pure)

1. **Parse the table** with zod: `voice` matches `^(dotty|hware)-floor-[a-z]+$`, `unit` is `ms`,
   `sprite` maps keys to `[offset, duration]` with offset ≥ 0 and duration > 0, at most 400 entries.
2. **Pair check**: the MP3's byte length equals `mp3Bytes`.
3. **Parse the MP3 frames**: skip an ID3v2 tag, walk MPEG-1 Layer III frame headers to the end, drop
   the `Info`/`Xing` frame. Refuse anything else (not MPEG-1 Layer III, sample rate changes mid-file,
   a broken frame chain).
4. **End check**: the table's last clip ends within 60 ms of the audio's end (seen: 36 ms).
5. **Slice** each clip: frames from `floor(offset / frameMs) − 2` to `ceil((offset + duration) /
   frameMs)`, clamped to the file. The 2 extra frames feed the bit reservoir (frames reach back up to
   511 bytes, less than 2 frames); they decode as silence or noise inside the previous clip's padding,
   and the player trims them.
6. **Keys**: `"0"`…`"180"` stay; `game_on` → `gameon`, `game_shot` → `gameshot`, `game_shot_match` →
   `matchshot`; `require_N` stays. Anything else is dropped (and counted in "Kept N of M clips").
7. **Name** the pack from the voice: "Autodarts Dotty (English)", "Autodarts Dotty (German)",
   "Autodarts Hware (English)"; language from the last part (`english` → `en`, `german` → `de`).

The clips are handed to the existing `service.ts` storage path (dedup by SHA-256, quota, owner-only).
Errors say what to do: "This JSON belongs to a different MP3", "The timings don't fit this MP3",
"Not an Autodarts voice file".

### Edge trim in the player

`player.ts` trims each decoded `AudioBuffer` once, when it's cached: drop leading and trailing samples
below a threshold (about −50 dBFS peak, over all channels), keeping about 20 ms either side. Only the
edges are touched, so pauses inside a clip ("you require … 141") stay. A clip that is all silence is
kept as is.

### Flag

`caller.autodartsImport` in `backend/src/flags/definitions.ts`, like `matchmaking.enabled`: on for
admins, on for everyone with `FLAGS_ON=caller.autodartsImport`. The SPA hides the guide and the
`.mp3`/`.json` file types; the server refuses the upload. Checkout calls are not behind it.

## Testing

Unit tests (vitest), with no Autodarts audio or tables in the repo:

- `autodarts.ts`, against small CBR MP3s built in the test from valid frame headers: ID3 skip, `Info`
  frame dropped, slice boundaries (2 frames before, rounded outward, clamped), end check, `mp3Bytes`
  pairing, key mapping, pack name, malformed tables refused.
- `checkout.ts`: `canCheckOut` false for 169, 168, 166, 165, 163, 162, 159 and 171+ in double out;
  true for 171, 174, 177, 180 and false for 179 in straight and master out; hints for 180 in straight
  out.
- `calls.ts`: the require call after a committed visit, none at the start of a leg or after a game
  shot, the team's score, the fallback order, `you_require` never borrowed, nothing when
  `callerCheckouts` is off.
- `createCaller`: with `callerCheckoutRepeat` off, no second call while the score stays the same.
- `pack.ts`: `require_N` and `you_require` accepted.
- `player.ts`: edge trim keeps an inner pause and a 20 ms margin.
- API: an Autodarts upload is refused with the flag off and stored with it on.
- The bookmarklet builds into a `javascript:` URL that parses.

Once by hand, with the real files (not committed): import the three MP3 + JSON pairs on the dev stack
and compare with the reference packs split by hand: the same keys after the `game_*` renames, every
clip at least as long as its reference clip (nothing cut short), clips decode in Chrome. Listen to
chained calls with Hware ("game shot · and · leg 3", "100 · you require 121") to check the trim closes
the gaps.

## Order of work

1. `canCheckOut` and the 180 cap.
2. Checkout calls and their settings.
3. en-adam's `require_*` and `you_require` clips.
4. The Autodarts import on the server, with the flag.
5. Edge trim in the player.
6. The bookmarklet and the guide.

Steps 1–3 ship without the flag.
