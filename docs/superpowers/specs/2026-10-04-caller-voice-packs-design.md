# Caller voice packs: design

A caller that announces each visit ("One hundred and eighty!", "Busted", "Game shot!") using voice
packs in the format of [darts-caller](https://github.com/lbormann/darts-caller) and the folders that
[Tools for Autodarts](https://github.com/creazy231/tools-for-autodarts) imports. dartcade ships one
built-in voice it's allowed to ship; every other voice a player imports themselves, from a zip file
or a link.

## Decisions

- **We support the format; we don't ship packs.** No imported pack goes in the repo or the image:
  packs stay bring-your-own, imported by a player (upload or link). Tests build tiny packs in the test
  itself; real packs used for manual testing stay out of git. The one voice we ship is the built-in
  "English (Adam)" (`backend/frontend/public/voices/en-adam/`), which we're allowed to: we generated
  it with Kokoro-82M (Apache-2.0; `scripts/caller-voice/`).
- **Stored on the server, per user.** An imported pack belongs to the user who imported it and is
  available on all their devices. Nobody else can see or play it.
- **Identical files are stored once.** Clips are stored by content (SHA-256). When two users import
  the same pack, both get their own pack record pointing at the same clip rows; nothing is duplicated.
  A user gets access to a clip only through a pack they imported themselves (they always bring their
  own files; dedup never hands anyone a file they didn't provide). Deleting a pack removes clips that
  no pack uses any more.
- **A storage limit per user**, set by `VOICE_STORAGE_LIMIT_MB` (default 50; 0 turns imports off). It
  counts the full size of every clip in the user's packs, shared or not, so dedup doesn't change what
  anyone is allowed. An import over the limit is refused with the numbers ("48.2 of 50 MB used").
- **Only the caller's clips are kept.** A 59 MB download keeps about 400 clips (about 3 MB). The zip
  itself is not stored.
- **Imports from links only from known hosts**: `darts-downloads.peschi.org` (darts-caller's packs),
  `autodarts.x10.mx` and `adt-socket.tobias-thiele.de` (Tools for Autodarts folders). HTTPS only, no
  redirects to other hosts, size and time limits, one import at a time per user and two at once
  across all users.
- **X01 only** in this change. **No player names** (dropped on import); a later step.

## The formats

Found by reading darts-caller's code, Tools for Autodarts' code, one darts-caller pack
(`en-GB-Arthur-Male-v4`) and the `autodarts.x10.mx/1_male_eng/` folder.

1. **darts-caller download**: a zip holding another zip (the clips) and a template CSV
   (`en-GB-v1.csv`). The i-th sound file in sorted name order is the i-th CSV row. Each row is the
   spoken text then the keys it plays for (`Gameshot and Match!;matchshot;`); a row with text only
   uses the lowercased text as its key (`180;;` → `180`). Several rows may share a key (`gameshot`
   has 29 variants); one is picked at random. UTF-8 with a BOM, `;`-separated.
2. **Clips named by key** (an installed darts-caller pack, or a zipped Tools for Autodarts folder):
   the file name is the key, lowercased, hyphens as underscores, `+N` marking variants
   (`gameshot+1.mp3`); spelled-out shots count as their keys (`game on`, `game-on` → `gameon`;
   `game shot`, `game_shot` → `gameshot`; `match shot` → `matchshot`).
3. **A folder link** (Tools for Autodarts style, e.g. `https://autodarts.x10.mx/1_male_eng/`): no
   listing (403), so the server tries the known names: `0`–`180`, `gameshot`, `game on`, `gameon`,
   `busted`, `matchshot` as `.mp3` or `.wav`.

Keys we use: `0`–`180`, `busted`, `gameshot`, `matchshot`, `gameon`, `leg_N`, `set_N`,
`bulling_start`. Everything else is ignored.

## What the caller says

| Moment                         | Clip                       | Notes                                                           |
| ------------------------------ | -------------------------- | --------------------------------------------------------------- |
| A visit ends with a score      | the visit total, `0`–`180` | a visit of 0 plays the pack's `0` clip                          |
| A bust                         | `busted`                   | instead of the total                                            |
| A checkout that wins a leg     | `gameshot`                 | then `leg_N` for the next leg if the pack has it ("Second leg") |
| A checkout that wins the match | `matchshot`                | falls back to `gameshot`                                        |
| The game starts                | `gameon`                   | after the bull off, if there is one                             |
| A bull off starts              | `bulling_start`            | optional; silent without it                                     |

**When a visit ends** is the same rule as the "Score left: After the visit" setting: the third dart,
a bust, a checkout, or else the takeout / Next player. Each visit is called once; a correction that
changes what a finished visit says calls it again. Teams: the thrower's visit total. Remote play:
every device with the caller on plays it.

## Settings

In the in-game settings drawer, under Sound, X01 only:

- **Caller**: on/off (off until a voice is picked).
- **Voice**: a choice of the user's imported packs (name from the file or link, e.g.
  "en-GB Arthur (Male)"). The choice is kept per device.
- **Import**: a zip file, or a link (with the allowed hosts named under the field). Shows "Importing…"
  then "Kept 385 of 12,422 clips", or a clear error.
- **Remove** the selected pack.
- The existing **Volume** applies.

## How

**Backend** (`backend/src/caller/`):

- `zip.ts`, `pack.ts`: the zip reader and pack parser (moved from the frontend, dependency-free; Node
  has `DecompressionStream`). `readPack` returns clips as bytes with a MIME type.
- `fetchPack.ts`: link imports: host allow-list, HTTPS only, manual redirect check, a byte cap, a
  timeout; a `.zip` link is downloaded and read; a folder link is probed name by name (a few at a
  time).
- `service.ts`: import (hash each kept clip, insert clips that are new, create the pack and its
  key → clip rows in one transaction), list, manifest, delete (and remove orphan clips).
- Migration `012_voice_packs.sql`: `voice_clips` (sha256 primary key, mime, bytes), `voice_packs`
  (id, owner, name, lang, source, created_at), `voice_pack_clips` (pack, key, clip).
- API (`schema/api-v1.yaml`):
  - `GET /api/voice-packs`: my packs and my usage (bytes used, the limit).
  - `POST /api/voice-packs` with an `application/zip` body (`?name=` the file name): import an upload.
  - `POST /api/voice-packs/import` `{ url }`: import from a link.
  - `GET /api/voice-packs/{id}`: the manifest (`key → clip hashes`), mine only.
  - `DELETE /api/voice-packs/{id}`.
  - `GET /api/voice-clips/{sha256}`: the audio, only if one of my packs uses it; cached as immutable.

**Frontend** (`backend/frontend/src/lib/caller/`):

- `calls.ts` (pure): from the previous and the new snapshot, what to say. Shares the "visit is over"
  rule with `heldScore.ts`.
- `voices.ts`: the user's packs from the API, the selected one (per device), import and remove.
- `player.ts`: fetches and decodes clips on demand (cached), plays a call's clips in order on the
  shared `AudioContext`; a new call cuts off one still playing.
- `GameDisplay.svelte` calls after each snapshot; the settings drawer has the Caller rows.

## Testing

- Backend unit: zip reader (stored/deflated/nested, broken zips, zip64/encryption refused), pack
  parser (darts-caller rule, key-named files, junk, mismatched counts), link fetching (allow-list,
  redirects off-list refused, byte cap, folder probing), all with in-test zips and a fake fetch.
- Backend DB: import dedups by hash across users; a user can't read another user's pack or a clip
  they don't own; delete removes orphan clips only.
- Frontend: `calls.ts` cases (scored visit, bust, checkout leg/match, third dart vs takeout, undo,
  corrections, new leg, teams, pristine start, mid-game first snapshot).
- Manual: import the real pack by upload and by link, the x10 folder by link, play a few legs.

## Later

- Player names (`you_require` + name clips), Around the Clock calls, a lobby-wide voice.
