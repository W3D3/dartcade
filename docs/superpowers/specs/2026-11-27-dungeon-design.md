# Dungeon

Dungeon is a co-op roguelike for 1 to 4 players on one board. The party climbs a map of fights,
shops and treasures, throws darts to hurt enemies, collects artifacts and segment items that change
what the board is worth, and tries to beat the boss. Think Slay the Spire and Balatro with a
dartboard as the input.

This spec is written so that an implementer can build the mode from it alone. It covers the rules,
the server model, the schema and the screens. It does not contain code.

- Game id `dungeon`, name "Dungeon", behind the flag `gamemode.dungeon.enabled` (admins by default).
- Numbers, artifacts, enemies and balance: [Dungeon: content catalogue](2026-11-27-dungeon-content.md).
- Visual design: the **Dartcade Platform Design** canvas, page `#page-dungeon-pixel` ("Game · Dungeon
  (pixel)"). See [Design reference](#design-reference). Read it with the Artifact tool, as
  described in `AGENTS.md`.
- How a mode is added in this repo: [`docs/adding-a-game-mode.md`](../../adding-a-game-mode.md).

## Status: decided and open

Everything below is decided unless it appears under **Open** here or under
[Proposed defaults](#proposed-defaults).

**Open (Christoph has not decided; build neither behind the other's back):**

1. **Do encounters have several enemies?** The mockups show a Skeleton and a Slime side by side. The
   recommendation is to make normal fights and elites a single enemy and give only bosses minions
   ("adds"). The rules below work for any number of enemies, so the choice is content and balance,
   not a code change. Until it is decided, build the multi-enemy rules (targeting, retargeting,
   overkill), and make an encounter a list of enemies so one enemy is the degenerate case.
2. **Do enemy attacks hit the whole party or one hero?** On 2026-11-26 Christoph asked for attacks
   that "hit the whole party", then asked to drop the "all" label and just telegraph the action like
   Slay the Spire. Read that as: the intent shows the damage number only, and the target is not
   written. This spec builds _every living hero takes the hit_ (see [Enemy turn](#enemy-turn)), which
   conflicts with the catalogue's "attacks alternate between players" for 2 players and its "second
   target" for elites and bosses. Confirm before tuning.

Resolution timing is **decided**: the whole visit resolves after the third dart. Dart-by-dart
resolution is deprecated (the "single dart" artboards stay on the canvas for reference only).

## Decided rules

| Topic            | Rule                                                                                                                                                                                                                        |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Players          | 1 to 4 seats, one party, no teams, no bots, no bull off. Seats are the heroes.                                                                                                                                              |
| Turn order       | Fixed: the seats' order. The party stands on screen in that order. Nobody picks who throws next, there is no tap to change it, and the screen has no turn-order row.                                                        |
| Round            | Every living hero throws one visit, then every enemy acts once (its telegraphed intent).                                                                                                                                    |
| Visit            | 3 darts (4 with Golden Dart). The visit is resolved **when it ends**, not per dart.                                                                                                                                         |
| Targeting        | Darts always hit the front enemy (the closest one). When it dies, the next one is targeted. There is no player-chosen target and no TARGET/NEXT text label; a gold bracket and plate mark the targeted enemy.               |
| Overkill         | Damage beyond a kill is wasted. The legendary artifact **Ricochet Flight** carries it over to the next enemy.                                                                                                               |
| Block            | A bar above the HP bar. It is shown full whenever the hero has any block, and the number shows the amount. Only enemy attacks drain it. It resets each round, unless Tower Shield.                                          |
| Enemy intent     | Telegraphed from the start of the round as an icon with a value where it has one (attack, block, buff), with a tooltip, as in Slay the Spire.                                                                               |
| Map              | Climbs strictly upward, floor 1 at the bottom. No edge ever leads down or sideways, so throwing for a direction is never confusing.                                                                                         |
| Map vote         | The party chooses the next node by throwing at the **left** or the **right** half of the board. The side with most votes wins; a tie is decided at random (by the game's `rng`).                                            |
| Artifact reveals | An artifact's effect is hidden in the damage popup until it fires (a surprise), then it pops in.                                                                                                                            |
| Fire effect      | The visit damage card burns in three levels: more than 50%, more than 75% and more than 100% of the target's HP at the start of the visit. The design is still being iterated; the thresholds are decided, the look is not. |

## The run

A run is a sequence of floors in an act. The first version has one act with 9 floors ("Act 1 · Floor 4
of 9"); floor 9 is the boss. Acts beyond the first are out of scope.

1. Setup: every seat picks a class; Healer also picks its healing segment. The party picks a
   difficulty (easy, medium, hard, expert; the lobby may suggest one with the auto rule in the
   catalogue). The game starts on the map at floor 1.
2. Map: the party votes for a node on the next floor (see [The map](#the-map)).
3. The node plays out: fight, elite, boss, shop, treasure or rest.
4. After a fight, rewards (see [Rewards](#rewards)), then the map again.
5. The run ends when the boss dies (victory) or every hero is at 0 HP (defeat).

HP does not refill between fights. Shops and healing items are how a party recovers, plus Spring
Tile, Healer and Bullseye Idol.

## The map

- A map is generated once at the start from the game's `rng`, so a replay gives the same map. Floors
  are numbered from 1 (bottom) to 9 (top, the boss).
- Every node has up to two ways up: one on the left and one on the right. A floor therefore offers at
  most two nodes, left and right, to the party standing on the floor below. Edges only go from floor
  n to floor n + 1.
- Node types: fight, elite, shop, treasure, rest, boss. The boss is on floor 9 and nowhere else. The
  generator must never put two elites or two shops next to each other in a row; beyond that, the mix
  is a balance matter (see [Proposed defaults](#proposed-defaults)).
- The map screen shows the nodes of the party's current floor and what lies beyond, the party's HP,
  the gold and every artifact. It shows **no fight details** (no HP, weaknesses, attacks): the only
  decision here is left or right.
- **Vote.** Each player throws once. A dart on the left half of the board is a vote for the left
  node, a dart on the right half for the right node. The result is decided when every living hero
  has voted: most votes win, a tie is random. The screen shows each node's type and the faces of the
  players who voted for it, live.
  Board halves are a proposal, see [Proposed defaults](#proposed-defaults).

## A fight

State of a fight: the enemies (HP, intent, statuses), the heroes (HP, block, statuses), the round
number and whose visit it is.

### The visit

1. The current hero throws darts. As each arrives, the game stores it and shows it (which segment,
   which ring) but does **not** compute any damage, block or heal. The board and the party UI show
   the darts like in any other mode.
2. After the last dart (or when the player ends the visit early, as in the other modes) the reducer
   resolves the whole visit in one pass and stores the result as a **resolution trace** (see below).
3. The client plays the trace as the visit damage popup. The popup can be skipped (tap anywhere);
   skipping never changes the result, which is already in the state.
4. Dead enemies are removed, the turn passes to the next living hero. After the last hero's visit,
   the [enemy turn](#enemy-turn) runs.

Why the whole visit: a dart that the player corrects (the board mis-read it) replays an open visit
cleanly, and artifacts that look at the three darts together (Piercing Sword, Knife Fan, Crown,
Shanghai Pot, Pyramid, Miniature Staircase, Trinity Medallion, Spiked Buckler's "last dart") need all
of them.

### Resolving a visit

Resolve the darts in the order thrown. For each dart:

1. **Target.** The front enemy that is alive at this point of the visit.
2. **Base.** The dart's board score: a single is its number, a double 2x, a treble 3x, the outer bull
   25, the inner bull 50. A miss is 0 and deals nothing (it can still trigger what looks at misses).
3. **Triggers**, in this order, each producing zero or more effects:
   1. **Segment**: items on the number or ring that was hit.
   2. **Artifacts**: the thrower's artifacts, in the order the thrower owns them.
   3. **Class**: the thrower's class.
   4. **Weakness**: the target's weak spot (x2).
   5. **Resist / immune**: a resisted dart deals half, an immune number deals 0
      ([Proposed defaults](#proposed-defaults)).
4. **Effects.** An effect changes one of: Base (`+N`), Mult (`+N` or `xN`), or something outside the
   damage number: block, heal, burn, chill, gold, a charge. Mult starts at 1.
5. **Damage** = Base x Mult, rounded down. It is applied to the target. If the target's HP reaches 0
   it dies and the next dart targets the next enemy. Excess damage is lost, unless the thrower (or
   anyone in the party, see Ricochet Flight below) carries it over.
6. Block, heal and the like are applied to the party straight away, in order. They do not depend on
   the order of other darts, except where an artifact says so.

Then, once, for the visit:

7. **After-visit triggers**: artifacts that say "after your visit" (Spiked Buckler, Tower Shield's
   effect on block resets is not one, Pyramid). Their damage goes to the front enemy at that moment.
8. Per-visit and per-fight status effects tick as the catalogue says.

**Ricochet Flight:** overkill is not wasted. When a dart kills an enemy, its excess damage hits the
next enemy. Whether the artifact works for the whole party or only for its owner is a proposal (see
[Proposed defaults](#proposed-defaults)).

**Marble Bust:** if a hit would take the enemy below 0, that visit's damage to it is cancelled and it
recovers 20 HP instead. This is the one case where overkill has a rule of its own.

### The resolution trace

The server stores, in the game state, a trace of the last resolved visit so the client animates it
without recomputing rules. The trace is data only (the reducer stays pure and deterministic), and it
is rebuilt on replay like everything else.

A trace is a list of darts. Each dart has: its segment (`number`, `ring`), the target enemy id, and a
list of **steps** in the order they fired:

| Field          | Meaning                                                                                               |
| -------------- | ----------------------------------------------------------------------------------------------------- |
| `source`       | `dart`, `segment`, `artifact`, `class`, `weakness`, `resist`, `afterVisit`                            |
| `id`           | the item, artifact or class id (hidden from the client until the step fires, see below)               |
| `effect`       | `base_add`, `mult_add`, `mult_mul`, `block`, `heal`, `burn`, `chill`, `gold`, `damage`, `self_damage` |
| `value`        | the number                                                                                            |
| `base`, `mult` | the running Base and Mult after this step                                                             |

plus the dart's final `damage`, the target's HP before and after, and whether it killed. After the
last dart a final `afterVisit` list of the same steps, then the visit total and the HP of every enemy
before and after.

**Surprise.** The popup shows no artifact before it fires. The client has no list of "upcoming
triggers"; it just plays the steps. (The server may send the whole trace at once, since the client
only reveals a step as it plays it; nothing in the UI shows a step ahead of time.)

### The damage popup

Plays on the trace; the canvas artboards `Dungeon-Pixel-Damage` (tablet/TV) and
`Dungeon-Pixel-Damage-Phone` are the reference.

- One row per dart: `BASE x MULT = DAMAGE`. Each step pops in as a chip (artifact sprite with its
  rarity outline, name, the change: `+10 Base`, `+0.5 Mult`, `x1.5 Mult`), changes the Base or Mult
  box, and the box animates. After the last dart, one more row for the after-visit artifacts.
- A running **Visit damage** total ticks up with every dart (white to yellow, then burning).
- **Rumble.** A box shakes harder for bigger numbers: Base over 100, Mult over 5 and a single dart's
  damage over 200 each rumble their own box (stronger and longer the bigger the number). The whole
  popup never rumbles.
- **Fire.** The Visit card burns in three levels once the total passes 50%, 75% and 100% of the
  target's HP at the start of the visit: a little, more, and the whole card on fire. Slow build-up,
  not many small flames. The design thread is still iterating on the look; implement the three tiers
  and the thresholds, treat the artwork as provisional.
- Enemy HP falls dart by dart in the popup as the trace says.
- On phones the dartboard is hidden while the popup plays. The board lights each dart's segment on
  the tablet/TV version.
- Tap anywhere skips to the end. The server state does not wait for the client.

### Enemy turn

After every living hero has had their visit:

1. Each enemy, in order, carries out its **intent** (chosen at the start of the round, see below).
2. An attack hits **every living hero** (open point 2 above). Damage = the enemy's attack value x the
   difficulty damage multiplier, reduced by Chill (-25%), then absorbed by block first, then HP. A
   Ghost ignores block.
3. Burn ticks on enemies at the end of the round.
4. Block resets (unless Tower Shield; Guardian keeps 50% of the unused block).
5. A hero at 0 HP is down and is skipped in the round order. Phoenix Feather revives its owner once
   per run at 50% HP.
6. If every hero is down, the run is lost.

**Intents.** At the start of a round each enemy picks (and shows) one intent from its pattern:
attack with a value, block, buff, or "none" on the off round of "every 2 rounds" attackers. The
catalogue gives each enemy's attack pattern; there are no random intents in v1 except where a row
says so (Chameleon's weak segment). Where a pick is needed, use the game's `rng`.

Because Chill shows on the intent (`Bone Slash will do 6, not 8`), the intent value on screen is the
value after Chill but before block.

### Treasure and rest (decided 2026-11-27)

- **Treasure.** Every player is offered 3 artifacts of their own and picks 1. Each player's offer is
  drawn separately from the game's `rng`, the picks are independent, and the node ends when every
  player has picked. Offers are for that player's own artifact list (artifacts are per player).
- **Rest.** Every hero heals by their score: each living hero throws one visit and heals for that
  visit's score (the sum of its darts, 0 to 180, capped at max HP). No artifacts, no choices, and
  artifact effects do not modify a rest visit. Downed heroes are not revived by resting.
  "Score" is read as the visit score; confirm if a different number was meant.

Neither node has an enemy, so neither has a target, intents or a damage popup. A rest still shows
each hero's visit and a heal animation on the HP bar.

### Rewards

The design does not define fight rewards. Proposed (see [Proposed defaults](#proposed-defaults)): a
fight pays gold and a choice of one segment item or artifact; an elite pays a guaranteed artifact of
rare or better; the boss ends the run. Gold is shared. A shop sells artifacts, healing and curse
removal. How a segment item picks its number is an open detail in the same section.

## Server model

A normal game module, as in the missions and the other multiplayer modes.

- **Pure rules** in `backend/src/shared/dungeon/` (no DB or IO; it is dependency-free so the
  frontend can use it for tooltips and previews, like `shared/missions/`): the content tables
  (`artifacts.ts`, `items.ts`, `classes.ts`, `enemies.ts`), the board geometry (opposite number,
  clockwise neighbour, ring of a dart, left/right half), `resolveVisit.ts` (the algorithm above),
  `enemyTurn.ts`, `map.ts` (generation, vote), `balance.ts` (HP and damage scaling, auto
  difficulty).
- **The module** `backend/src/games/dungeon.ts`, registered in `games/index.ts`, name in
  `shared/gameNames.ts`, flag in `flags/definitions.ts` (both `FLAG_META` and the provider config).
  `init` gets the seed-bearing `rng`; use it for the map, offers and ties and never `Math.random`.
  Everything is derived from the config, the seats and the inputs, so a restart or a corrected dart
  replays to the same state. Bump `version` when a rule change would alter a replay.
- **Config** (`configMeta`): difficulty, and per seat the class and the Healer's segment. Players
  come from the lobby.
- **Phases** in the state: `setup`, `map`, `battle`, `shop`, `treasure`, `rest`, `reward`, `ended`.
- **Inputs** the reducer understands: board darts (`onBoardEvent`) and manual darts, as in every
  mode; user actions for what is not a dart: `dungeon_pick_class`, `dungeon_place_item`,
  `dungeon_buy`, `dungeon_choose_reward` (also the treasure pick), `dungeon_leave_shop`. Which of these can also be done by a
  dart (placing an item by throwing at the number, the vote by throwing at a half) is in
  [Proposed defaults](#proposed-defaults).
- **View** (the snapshot's `game`): phase; the act, floor and map graph with the current node and
  the votes; the party (per hero: seat, class, HP, max HP, block, statuses, artifacts, whose turn);
  gold; the board's segment items by number and ring; the encounter (enemies with HP, max HP, weak,
  resist, immune, statuses, intent, and which one is the target); the round number; the last
  resolution trace; the offers (reward, shop); `nextPlayer` from `upNext`.
- **`summarize`** must work without a winner (a forfeit) and ranks nobody: the result is
  victory or defeat of the whole party with floors cleared. **`detail`** and **`matchStats`**: floors
  cleared, damage dealt and the best visit per player, artifacts at the end.
- **Stats.** Proposed: a Dungeon game counts for no stats, ratings, form, XP, challenges or
  achievements in v1, like missions (`gameCounts` in `db/counts.ts`).
- **Replay and history.** The details page replays the input log through the reducer like any game
  (the stored `game_details`, see `history/detail.ts`).

## Schema

Add the view to `schema/game-ws-v1.json` (`DungeonGame` plus `DungeonSnapshot`, an entry in
`Snapshot.oneOf`, a `UserAction` branch for each action above) and the detail to
`schema/api-v1.yaml` (`DungeonDetail`, `mode: enum [dungeon]`, added to the `GameDetail.detail`
`oneOf` and its discriminator mapping). Run `npm run gen:api`. Both are described in
[`docs/adding-a-game-mode.md`](../../adding-a-game-mode.md#2-the-schema). The resolution trace is a
field of the view, as above.

## Client

Follow the checklist in `docs/adding-a-game-mode.md` (tables the compiler keeps complete, Play page
entry, setup form, details page sections, match screen from `MatchFrame` and `BoardOrKeypad`, a
`viewOnly` prop for the big screen). Dungeon-specific points:

- **Board overlays** (as the canvas): item markers on numbers (a badge on a whole number, a ring
  marker where an item sits on one ring), a green ring on the weak ring or number, hatched wedges on
  immune numbers, the last darts. They follow the front enemy and the segment items. The standard
  dartboard component stays; it needs overlay slots for these.
- **Battle screen** (`Dungeon-Pixel-Battle`, `Dungeon-Pixel-Battle-Phone`): the party on the left in
  seat order, the enemies on the right with the front enemy marked by gold brackets and a gold plate
  (no text label). Heroes show HP bar, a block bar above it (full while any block; the amount as a
  number), a class icon and status icons. Enemies show HP, intent icon with value, and chips as
  **icons** with a short value and a tooltip on hover or tap (weak, immune, resist, chill, burn).
  Prefer icons over text everywhere, as in Slay the Spire. HP and block bars use a small corner
  radius (3px). No turn-order row, no "LIVE" badge.
- **Map screen** (`Dungeon-Pixel-Map`, `Dungeon-Pixel-Map-Phone`): the map runs the full height,
  floor 1 at the bottom; round nodes joined by curved paths that only go up; the party panel; every
  artifact is interactive: hover (tablet/TV) or tap (phone) shows a popup with the artifact's pixel
  sprite, rarity, owner, effect and when it triggers (`On each dart`, `After your visit`, `Start of
  fight`, `On a kill`, `On a treble`, `On a double`, `After a fight`, `Once per run`). The vote card
  is small: a board split into left and right halves, each player's dart on it, and the faces of
  the voters on each node.
- **Artifact art**: a small pixel sprite per artifact, outlined exactly around the sprite's
  silhouette, thick, in the rarity colour: grey common, green uncommon, blue rare, purple epic, gold
  legendary.
- **Pixel art** is for characters, enemies and artifacts only. The rest of the UI keeps the smooth
  Dartcade style (rounded cards, Barlow Condensed and Instrument Sans, line icons), with a dark
  purple stone and gold palette for this mode. The sprites are hand-drawn grids with shading, a dark
  ink line and a dithered ground shadow; the canvas has the first set (three heroes, Skeleton, Slime)
  to copy.
- **Not to build**: the first Dungeon page (`Dungeon-Battle`, `Dungeon-Map`; an earlier take with a
  turn-order tap strip and a path that went sideways), and the one-dart-at-a-time artboards
  (`Dungeon-Pixel-Dart*`; deprecated).

## Missing mockups

The canvas has no screen yet for the **treasure** node (three artifact cards per player, pick one),
the **rest** node (each hero's visit and heal), the **shop**, class selection, the reward pick after
a fight, and the victory and defeat screens. Build them from the same style (smooth UI, pixel
sprites, rarity outlines, artifact hover or tap popups) and ask for a mockup if a layout decision
matters.

## Placeholders in the design

The canvas shows artifacts and numbers that exist only to make the popup readable. Do not take
them from the artboards; take them from the [catalogue](2026-11-27-dungeon-content.md).

- The artboards' Pin Cushion ("every single gets +5 Base"), Knife Fan ("+0.5 Mult for each dart you
  already threw this visit"), Spiked Buckler and Tower Shield text, Bullseye Idol ("a bull counts as
  a treble"), Crown ("+15 gold after elite and boss fights"), Tinderbox, Frostbite Dagger and
  Piercing Sword text differ from the catalogue. The catalogue wins.
- The popup arithmetic is illustrative. Its Mult column (for example 1, 1.5, 2.0, 3.0, 6.0) does not
  follow one consistent rule across darts. Use the rule in
  [Resolving a visit](#resolving-a-visit): `+N` adds to Mult, `xN` multiplies the running Mult, in
  trigger order.
- Enemy values on the canvas: Skeleton 216 HP and Slime 144 HP are the catalogue's base values at 3
  players on Medium (x2.4). A "Bone Lord" with 900 HP and an Anvil Rune (+70 Base) exist only in
  the popup so it reaches 743 damage and the fire effect; neither is content.
- "Armored Knight, 288 HP" on the first map page is the catalogue's value at x2.4.

## Proposed defaults

The design and decisions above do not settle these. They are proposals so the implementer is not
blocked; each is small to change. Christoph has not confirmed any of them.

- **Resist and immune.** A resisted dart deals half damage (round down). An immune number deals 0.
  The Armored Knight's "singles deal 1" is a special case: singles deal exactly 1.
- **Left and right half.** Split the board along the vertical axis: the numbers whose wedge centre is
  on the left (19, 7, 16, 8, 11, 14, 9, 12, 5) are left and the ones on the right (1, 18, 4, 13, 6,
  10, 15, 2, 17) are right. 20 and 3 lie on the axis and the bull has no side; a dart there does
  not vote and the player throws again (or: a dart on the axis counts by the side of its
  landing point, if the board gives coordinates).
- **One vote per player**: one dart, not a whole visit.
- **Fight rewards.** A fight pays gold (scaled by floor) and offers three artifacts or segment items
  to choose from, picked on the screen. An elite offers three rare-or-better artifacts. The boss is
  the end of the run. An artifact offered after a fight goes to a seat the party picks.
- **Segment item placement.** On the screen: pick the item, tap a number or ring on the board
  drawing. Not by dart.
- **Gold** is shared, starts at 0.
- **Map mix.** Fights most common, an elite about every third floor, a shop and a treasure by the
  middle of the act. Never two elites or two shops in a row (the one hard rule above).
- **Ricochet Flight** applies to the whole party's darts, not only its owner's.
- **Clockwork Gear's "next segment clockwise"** and **Counterweight's "opposite"** use the board's
  clockwise number order: 20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5.
  The opposite of a number is the number half a turn away (20 and 3, 1 and 19, ...).
- **Mode availability.** On a board (camera or board manager) or by manual entry, like any mode.
  Remote play across several boards is out of scope for v1.
- **Not in v1:** more than one act, bots, teams, ranked play, achievements and challenges, custom
  parties of artifacts, and the Healer's class pick being random.

## Testing

- Unit tests for `shared/dungeon/` with fixed dart sequences for each artifact and item, and golden
  traces for a few full visits (the popup's three darts are a good fixture once their effects use the
  catalogue's values).
- A replay test: the same inputs and seed give the same state, including after removing and
  re-adding the last dart of an open visit. A reducer test for the `dungeon` module through
  `detail.contract.test.ts` and `snapshot.contract.test.ts`.
- Rule tests the spec calls out: overkill is wasted by default and carries over with Ricochet
  Flight; a kill retargets mid-visit; Marble Bust's bust; the vote tie is random but seeded; the
  map never has an edge that is not upward.
- A screenshot per new screen under `docs/dungeon/` (the repo's rule for a new game), taken with
  the flag on in the screenshot stack (`FLAGS_ON` in `e2e/docker-compose.screenshots.yaml`).

## Design reference

Canvas: https://claude.ai/artifact/2ZyCCfSMhs3PKZzNLzsw23, page `#page-dungeon-pixel`. Artboards
(each is `project/<name>.dc.html` on the canvas):

| Artboard                                                                     | Shows                                                                    | Use                      |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------ |
| `Dungeon-Pixel-Battle`, `Dungeon-Pixel-Battle-Phone`                         | Battle: party, two enemies, board, intents, last visit                   | Build                    |
| `Dungeon-Pixel-Damage`, `Dungeon-Pixel-Damage-Phone`                         | Visit damage popup: three darts then after-visit; rumble, fire; surprise | Build                    |
| A "Fire levels" artboard (Damage page)                                       | The three fire tiers                                                     | Build (look provisional) |
| `Dungeon-Pixel-Map`, `Dungeon-Pixel-Map-Phone`                               | Map, party panel, artifact hover popups, left/right vote                 | Build                    |
| `Dungeon-Pixel-Dart`, `Dungeon-Pixel-Dart-Phone`                             | One dart at a time                                                       | Deprecated, do not build |
| `Dungeon-Battle`, `Dungeon-Battle-Phone`, `Dungeon-Map`, `Dungeon-Map-Phone` | First, smooth-style take                                                 | Superseded               |

The layout rule for game views in `AGENTS.md` (board in the centre with a panel per side for two
players, stacked rows for three or more) does not apply to the battle screen: the party and the
enemies face each other and the board sits below or beside them, as in the artboards.

## Out of scope

Everything under "Not in v1" in [Proposed defaults](#proposed-defaults), plus the sprite art
production pipeline (use hand-drawn grids as on the canvas) and sound.
