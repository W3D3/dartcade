# Basic mobile UI: design

Date: 2026-10-02

## Goal

Make dartcade usable on a phone, about 390 px wide, following the phone artboards in the
**Dartcade Platform Design** canvas. You can sign in, set up a game, and play it (X01 and
Around the Clock): you see the scores, enter darts by tapping the board, correct them,
undo, and move to the next player. Today the app is desktop-only: it has a fixed side
nav, and the match screen uses fixed 380, 480 and 560 px columns.

This round is about every basic flow working and being comfortable on a phone. Pixel
parity with every phone artboard is not the goal.

## Scope

In:

- **Shell:** below `md` (768 px), the side nav becomes a bottom tab bar.
- **Sign in and Register**, per `Mobile-SignIn`.
- **Play** (`CreateSession`), per `Mobile-Play`.
- **Live match** (`GameDisplay`), per `Mobile-Match` (X01) and `Mobile-ATC`, for 1, 2,
  and 3 or more players, including the bull off and the win overlay.
- **History and Boards:** made usable on a phone (no horizontal overflow, tap targets
  of at least 44 px, modals fill the screen). They aren't rebuilt to their phone
  artboards.

Out (a later round):

- Rebuilding History and Boards to `Mobile-History` and `Mobile-Boards`.
- The X01/ATC details pages and the tablet artboards.
- Lobby screens; they come with multiplayer plans 2 and 3.
- Tournaments, which don't exist yet.

## Approach

One codebase.

- **Simple pages:** these adapt with Tailwind breakpoints. Desktop stays exactly as it
  is at `md` and up.
- **Match screen:** on a phone its structure is different, with stacked cards instead
  of side columns. `GameDisplay` already chooses a layout (`solo`, `duel`, `party`)
  and renders it from shared snippets (`center`, `panel`, the rows). This round adds a
  `phone` layout, used whenever the viewport is narrower than `md`, built from the same
  snippets and components. The game logic in `GameDisplay` stays shared; only the
  markup branches.
- **Phone detection:** a small `isPhone` store (`$lib/viewport.ts`) wraps
  `matchMedia('(max-width: 767.98px)')` and updates when the viewport changes. Layout
  decisions that CSS alone can't express read it. Everything else uses breakpoint
  classes.

## Screens

### Shell (`Layout`)

- **Below `md`:**
  - `SideNav` is hidden and a `TabBar` sits at the bottom: Play, Live, Boards,
    History.
  - Live shows only while the user has a running game, with the red dot from the
    canvas, and links to it.
  - The tab bar is 72 px tall plus `env(safe-area-inset-bottom)`. The active tab has
    the lime icon on the raised background.
- **Pages** get the phone header: 56 px tall, with the board-ring mark and the
  page title.
- **`SessionBanner`** stays and wraps to fit the narrow width.
- **`index.html`** gets `viewport-fit=cover`, so the safe-area insets apply.

### Sign in and Register

Per `Mobile-SignIn`:

- A 250 px hero strip with the dartboard graphic cropped at the right, the
  wordmark, and "Step up to the oche."
- Below it, the form with 52 px inputs.
- The primary button sits near the bottom, with the "Create an account" link
  under it.

Register uses the same layout. The desktop split layout stays from `md` up.

### Play (`CreateSession`)

Per `Mobile-Play`:

- **Header:** the board selector moves into the phone header as a chip (a status dot
  and the board name).
- **Mode picker:** a 2-column grid of mode tiles, 92 px tall.
- **Setup card:** the existing setup controls (segmented controls, the legs stepper),
  full width with 44 px controls, and the existing player list below them.
- **Start button:** a sticky full-width "Game on" bar above the tab bar.

### Live match (`GameDisplay`, layout `phone`)

Per `Mobile-Match` and `Mobile-ATC`. The phone layout has no tab bar: the match is
full screen, like on desktop.

**Header:**

- the back button, which leaves the game the way the desktop does today
- the game title with the LIVE badge
- the meta line, e.g. "501 · Double out · First to 3 · Leg 3"
- the settings button

**Players:**

| Player count | What shows                                                                                                                                |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 2            | The other player as a compact row on top (name, "Up next" or a checkout hint, leg pips, points left). Below it, the active player's card. |
| 3 or more    | Compact rows for every player who isn't up, in throwing order, scrolling if needed. Below them, the active player's card.                 |
| 1            | Only the active card, which carries the session stats.                                                                                    |

The **active player's card** shows:

- the name, the board name, a "Throwing" pill, and leg pips
- the big score (ATC: the current target and progress)
- leg avg, match avg and darts
- the chalkboard at 150 px, when the chalkboard setting is on

**Dart entry and controls**, pinned to the bottom of the screen:

- the board's name, and the board itself
  - it takes the height that's left: at least 180 px, at most the screen width
  - tap it to enter a dart; tap a dart to correct it, as today
- the visit total band
- three dart slots, 58 px tall, showing suggested targets as today
- the control bar: Undo, and Skip to next or the next-player button

**Other states:**

- **Manual entry:** the existing entry-panel view switch keeps working; the entry
  panel is full width.
- **Overlays:** the bull off panel and the win overlay reuse the existing components.
  On a phone they fill the width and use smaller type.

### History and Boards

- Content goes full width with 16 px side padding.
- Anything wider than the screen stacks or wraps instead of scrolling sideways.
- Modals (pairing, confirmations) fill the screen below `md`.

## Testing

- **Unit:**
  - the `isPhone` store follows `matchMedia` changes
  - the tab bar marks the active route
  - the tab bar shows Live only while a game is running
- **Component:** `GameDisplay` renders the `phone` layout when `isPhone` is true, and
  the desktop layouts otherwise. Run it with a 2-player X01 snapshot and a 3-player ATC
  snapshot.
- **Manual:**
  - in the browser at 390 × 844 and at 1440 × 900, to confirm the desktop is
    unchanged
  - on a real phone over the tailnet: sign in, start an X01 game, enter and correct a
    dart, undo, finish a leg
- The existing frontend tests and the typecheck must stay green.
