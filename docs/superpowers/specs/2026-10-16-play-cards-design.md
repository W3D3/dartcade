# Play page: illustrated game cards

The design canvas's `Play-Cards` artboards (`Play-Cards`, `-Setup`, `-Small`, `-Course`) replace the
Play page's glyph tiles with illustrated cards grouped by category.

## What the page does

- **Nothing picked yet.** The page opens on every game, in three categories, each with a heading
  and a one-line subtitle: Arcade ("Dart minigames for groups"), Classic ("The standards, with full
  stats") and Practice ("Drills and other games"). Big games are 352×188 cards with an
  illustration, the name and a one-line description. Small games are 352×56 rows with the
  illustration in a 76 px strip on the left.
- **Hover and focus.** The illustration is greyscale at rest. On hover or keyboard focus it shows
  its colours, grows by 4 %, picks up a lime soft-light tint, and the card lifts by 2 px with a
  lime border and glow. A coming-soon card has a dashed border, a Soon badge, 60 % opacity, and
  doesn't react to hover.
- **A game picked.** The cards shrink to a 300 px column of 52 px name-only rows, with the picked
  one marked by a lime border and a bar on its left edge. Coming-soon games drop out. An "All
  games" button above them goes back to the grid. The settings panel slides in from the right:
  a header (thumbnail, category, name, description), the game's settings in two columns, and a
  footer with the settings in one line ("501 · Double out · First to 3 legs"), the hint "Players,
  teams and throw order come next, in the lobby", and the Choose players button.
- The subtitle under "New game" follows the state: "Pick a game. Players are chosen in the lobby
  next." / "Set up X01, then choose who plays in the lobby."

## Decisions

- **Games.** Live: X01 and ATC (Classic), Minigolf (Arcade, still behind its flag). Every other game
  on the artboard is shown as coming soon: Cricket (Classic), and 121, Bob's 27 and Soccer, plus the
  small Higher Lower, Catch 40, Shanghai, Killer and Halve-it (Practice). The artboard shows some
  of these as playable, but they don't exist yet. Tournament leaves the grid because it has its own
  nav entry.
- **Names follow the design**: ATC's card reads "ATC", and its description spells out Around the
  Clock.
- **Where it opens.** On the grid, even when a saved mode exists (the saved settings per mode are
  still used). It opens on the lobby's game when you host a lobby that already has a next game
  (Continue), and always for a member of someone else's lobby. A member can't change the game, so
  no All games button.
- **Phones and tablets** follow `Mobile-Play-Cards` and `Tablet-Play-Cards`. Phones get two
  cards a row (118 px, name only) with the small games as 52 px rows. Once a game is picked, a
  row of chips that scrolls sideways (All, then the playable games) replaces the cards above a
  one-column panel, and Choose players sits in a bar at the bottom. Tablets (md up to xl) get
  332×162 cards, and from lg a 260 px list beside a 728 px panel. Below lg the chip row is used
  there too.
- **Illustrations** are the artboard's SVGs, kept as files in `lib/assets/games/`.
- **The lobby's Change game dialog** keeps the compact glyph tiles. It is a 440 px dialog the
  artboards don't cover.

## Not in this change

- The header's board picker ("Board · Living room"): picking boards happens in the lobby.
- The Minigolf course dialog with hole previews (`Play-Cards-Course`): the course stays the
  existing radio list in the settings.
- The Rules link in the panel header: there is no rules view to link to yet.
- The artboard's dashed "More minigames soon" card after Arcade's games.
