# Adding Dungeon content

Dungeon's content is data in `backend/src/shared/dungeon/content/`. The engine reads it through hooks
and never names a piece of content, so new content is an entry in one of these files. The rules are in
the [game spec](superpowers/specs/2026-11-27-dungeon-design.md) and the numbers in the
[content catalogue](superpowers/specs/2026-11-27-dungeon-content.md).

Each registry is a `const` object checked with `satisfies`, and its id type is its keys. A typo in an id
that another entry names (a class's starting artifact, an encounter's enemy, an event's item) fails the
typecheck. `backend/src/shared/dungeon/content.test.ts` checks what the compiler can't: every entry has a
description and a hook or a modifier, and no id is used by two kinds of content.

## Add an artifact

1. Add an entry to `ARTIFACTS` in `content/artifacts.ts`, keyed by its id in camel case:

   ```ts
   shotgunShell: {
   	name: 'Shotgun Shell',
   	rarity: 'common',
   	status: 'accepted',
   	description: 'Each dart on a different segment than your previous dart deals +8 damage.',
   	trigger: 'On each dart',
   	hooks: {
   		onDart: ({ hit, previous }) => (previous && previous.number !== hit.number ? [{ effect: 'base_add', value: 8 }] : []),
   	},
   },
   ```

2. Add its sprite to `SPRITES` in `backend/frontend/src/lib/dungeon/sprites.ts`: a palette and one string per
   pixel row, each character an index into the palette and `.` transparent. Draw no outline: the screens draw
   the rarity outline around the silhouette. The typecheck fails until the sprite is there.
3. Add a case to `resolve.test.ts` that throws a fixed visit and checks the damage and the trace steps.

A hook returns effects and never changes state. `resolveVisit` (`resolve.ts`) applies them and writes one
trace step for each, which is what the damage popup shows. Pick the hook by when the artifact fires:

| Hook         | Fires                                    | Sees                                                      |
| ------------ | ---------------------------------------- | --------------------------------------------------------- |
| `onDart`     | for each dart, before its damage         | the dart, the whole visit, the previous dart, the thrower |
| `afterDart`  | for each dart, after its damage is dealt | the same, plus `damage`                                   |
| `afterVisit` | once, after the last dart                | the visit and the thrower                                 |

An effect is one of `base_add`, `mult_add`, `mult_mul` (the dart's damage is Base x Mult, rounded down),
`block` and `heal` (the thrower, or every living hero with `party: true`), `burn` and `chill` (the dart's
target), `gold`, or `damage` (the front enemy, or with `second: true` the next living enemy after the
target). An effect the engine doesn't have yet is a new `EffectKind` in `content/types.ts`, a case in
`applySide` in `resolve.ts`, and the value in `DungeonTraceStep.effect` in `schema/game-ws-v1.json`
(then `npm run gen:api`).

A lasting change that no single dart causes is a modifier (`Modifiers` in `content/types.ts`), read where
it applies: `maxHp` when the run starts (`beginRun` in `run.ts`), `blockCarry` at the end of a round
(`enemyTurn.ts`).

Treasure rooms offer every artifact in `ARTIFACTS`, so a new one shows up in offers at once.

## Add a segment item

Add an entry to `SEGMENT_ITEMS` in `content/segmentItems.ts`. Its hooks fire for any hero whose dart lands
on the number it sits on, before the thrower's artifacts. Items reach the board through event outcomes
(`{ kind: 'item', item: '<id>' }` in `content/events.ts`), which place them on a random free number.
`DUNGEON_RULES.slotsPerNumber` in `rules.ts` caps the items per number.

## Add a class

Add an entry to `CLASSES` in `content/classes.ts` with a `startingArtifact`. Its hooks fire after the
thrower's artifacts. No two heroes in a run may share a class. Give it a sprite (facing right) in `SPRITES` and a colour in `CLASS_COLOR`
(`backend/frontend/src/lib/dungeon/view.ts`): its HP bar and its bars on the run summary.

## Add an enemy

Add an entry to `ENEMIES` in `content/enemies.ts` and a sprite (facing right; the battle screen turns it) in
`SPRITES`, then name it in an encounter in `content/rooms.ts`:

- `hp`: base HP for one player on Medium. `enemyHp` in `rules.ts` scales it by party size and difficulty.
- `pattern`: the intents it cycles through, one per round. An `attack` hits every living hero. `pierce`
  ignores block.
- `defences`: the spots it is `weak` to (x2), `resist`s (x0.5) and is `immune` to (x0). A spot is a number
  (`{ number: 19 }`) or a ring of any number (`{ ring: 'double' }`; `bull` covers both bulls).
- `phases` (optional): defences that replace the base ones once its HP falls to `below` of its max HP.

`ENCOUNTERS` lists each battle room's encounters by floor. An encounter is the enemies front first; the
front one is the target.

## Add an event

Add an entry to `EVENTS` in `content/events.ts`: a title, a text and two to four decisions, each a label
and a list of outcomes (`gold`, `hp`, `artifact`, `item`). An `hp` outcome never downs a hero. The map
generator draws events with the weight `DUNGEON_RULES.map.weights.event` in `rules.ts`.

## Change a game property

Every number a run plays by is in `DUNGEON_RULES` in `rules.ts`: party size, starting HP, items per
number, offer size, Chill, the map's room weights and the gold per fight. The lobby picks the fields of
`DungeonConfig` (difficulty and floors). To let the lobby pick another property, add it to `DungeonConfig`
and `DEFAULT_CONFIG`, give it a `configMeta` entry with options in `backend/src/games/dungeon.ts`, read it in
`rulesOf`, and add its key to `OPTION_FIELDS.dungeon` in `backend/frontend/src/lib/components/GameSettings.svelte`.
Darts per visit is fixed by the engine (`DARTS_PER_VISIT` in `backend/src/shared/darts.ts`).

A rule change that would replay a stored game differently needs a new `version` in
`backend/src/games/dungeon.ts`.
