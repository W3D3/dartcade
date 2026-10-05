# Tablet layout: design

Make the app fit tablets as the **Tablet-\*** artboards in the Dartcade Platform Design canvas show
(1180×820, iPad landscape). Today a tablet gets the desktop layout, which breaks at that width:
the sign-in form is pushed off the edge, History's columns wrap one word per line, Boards' live
events spill out of their panel, and a two-player match clips "501".

## Decisions (with the user, 2026-10-04)

- **A tablet band from 768 to 1279.98 px** (Tailwind `md` up to `xl`), so iPads in portrait (820
  wide) are covered too. Phones (< 768) and desktops (≥ 1280) don't change.
- **The "Game in progress" banner stays** at tablet width, as well as the rail's Live item.
- **This round is only the re-layout.** Not included, at any size: the X01 and Around the Clock
  match-details pages, the designed win and podium screens, the Abort/Abandon game dialogs,
  Friends and presence, Tournaments, the leg-history button, Profile.

## Shell

- **Icon rail, 88 px,** instead of the 248 px sidebar in the band (as in Tablet-Boards, -Play,
  -History, -Lobby):
  - logo on top
  - items 72×64 with a 22 px icon and an 11 px label: **Play** (with the invites badge), **Live**
    (red dot, only while a game runs), **Boards**, **History**. No Tournaments item while the
    route doesn't exist.
  - at the bottom: a **Lobby** item (dot + lobby name when you're in one, "Create lobby"
    otherwise; the `LobbyIndicator` view model), and an **avatar button** that opens the existing
    `AccountMenu` (Settings, Sign out, the dev user switch). No Friends item.
  - reuse `navTabs()` (`lib/nav.ts`) for the items, as `TabBar` does.
- `lib/viewport.ts`: an `isTablet` store (md..xl) next to `isPhone`/`isWide`, for layout choices
  CSS can't express. Prefer CSS (`md:` + `xl:`) where it can.
- Page side padding about 32 px in the band (today 44 px).

## Match screen (all match artboards)

The layout rule holds (2 players: board in the centre, a panel each side; 3+: board to the side,
stacked rows); only the sizes change in the band.

- **Header:** 60 px tall, 20 px side padding, 24 px title, 13 px meta.
- **Two players:** panels a fixed 300 px, the centre takes the rest; board up to 400 px. The big
  score (and Around the Clock's target) scales with its panel, not only the viewport height (a
  container query on the panel), up to 150 px, so "501" never clips and names don't truncate to
  one letter. **Where two 300 px panels and the centre don't fit (below about 1024 px, i.e.
  portrait), two players use the stacked-rows layout** of 3+ players.
- **Three or more players:** board column 400 px (today 480), row columns a little narrower
  (about 190 / 150, inactive score 120).
- Teams: no tablet artboard; keep today's compact layout below 1280.
- The remote pieces (board caption, turn status, not-your-turn toast, waiting card, offline
  notice and keypad) already exist; check they fit the new sizes and fix what doesn't.

## Pages

- **Sign in / Register** (`AuthPanel`): in the band the brand panel is 500 px with an 80 px
  headline and no mode chips; the 400 px form is centred in the rest with a 44 px title.
- **History:** a band grid without the Board column and without the header row: when · game and
  meta · opponents · result pill · key stat (`110px 1fr 200px 110px 90px`); filter chips beside
  the title. No chevron/link while the details page doesn't exist.
- **Boards:** a 2-column grid of board cards (status and latency, name, IP, cameras / bridge /
  games), the "Pair a new board" card in the grid, and below it a **Selected** bar (name,
  bridge / latency / paired, Play on this board, Unpair) instead of the right-hand detail panel.
  The cameras and live events of the selected board stay reachable (an expandable section under
  the bar), never overflowing.
- **Lobby:** a `1fr 420px` grid; the invite code with Share link and Close lobby move into the
  page header in the band; the Next game card no longer wraps.
- **Play:** mode tiles as compact cards in two columns, a 440 px setup aside.

## Testing

- Unit tests for `isTablet`, the rail's items (Live only with a game, the Lobby item's states),
  and which match layout two players get at a given width.
- Screenshots at 1180×820 and 820×1180 of every changed screen, compared with the artboards; and
  at 390 and 1440 wide to show phones and desktops didn't change.
