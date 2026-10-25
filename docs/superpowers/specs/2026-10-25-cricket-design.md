# Cricket design

Issue: [#102](https://github.com/W3D3/dartcade/issues/102)

## Goal

The classic pub game as a dartcade mode, behind `gamemode.cricket.enabled`. Players open
numbers to score on them and close the numbers their opponents score on.

## Scope

In v1:

- Modes: **standard** and **cut-throat**.
- Targets: 15–20 and the bull.
- Singles and teams (`teams: true`, one shared set of marks and points per team, like X01).
- Legs (first to N).
- Bot seats.
- Bull off for the throwing order (`withBullOff`).

Follow-ups, not in v1: no-score mode, random targets, bull off/on as a setting, marks to
open (2–4), round limit, ranked play, bot calibration to MPR.

## Rules

- **Marks:** a single is 1 mark, a double 2, a treble 3. Outer bull is 1 mark, bullseye 2.
  Any other number is a miss.
- **Opening:** 3 marks on a target opens it for that team.
- **Standard scoring:** once a team has opened a target, each further mark scores the
  target's value (25 for the bull) for that team, while at least one opposing team hasn't
  opened it.
- **Cut-throat scoring:** each further mark adds the target's value to every opposing team
  that hasn't opened it.
- **Closed:** when every team has opened a target, it scores for nobody.
- **Leg win:** checked after every dart. A team wins the leg when it has opened all seven
  targets and has at least as many points as every opponent (cut-throat: no more points
  than any opponent). The leg ends on that dart, mid-visit, like an X01 checkout. A team
  that has opened everything but is behind keeps throwing.
- **Match:** first team to `firstTo` legs. The leg starter rotates the way X01's does
  (`legStart` in `x01.ts`).
- No round limit: a stalled game ends through the usual abort or forfeit.

## Approach

One module, with the rules in a pure core.

- `backend/src/games/cricketRules.ts`: pure functions shared by the reducer, the bot and
  the tests.
  - `marksFor(dart)`: target index and mark count, or none.
  - `applyMarks(state, team, target, n)`: new marks and points.
  - `legWinner(state)`: the winning team, or null.
  - `cricketTarget(state, team)`: the bot's aim, as a label (`T20`, `25`, `Bull`).
- `backend/src/games/cricket.ts`: the `GameModule`, wrapped with `withBullOff` like X01.

## Config

```ts
type CricketConfig = {
  mode: 'standard' | 'cutthroat'
  firstTo: number
  bullOff: 'off' | 'wdc' | 'pdc'
  botSpeed: 'fast' | 'normal' | 'slow'
} & TeamsConfig
```

`configMeta` uses the same options and labels as X01 for `firstTo`, `bullOff`, `botSpeed` and
`format`.

## State

Per-team fields are indexed by `teamOf[seat]`; in singles every seat is its own team.

- `targets: number[]`: `[20, 19, 18, 17, 16, 15, 25]`. Fixed in v1; stored so random targets
  need no state change later.
- `marks[team][targetIdx]`: capped at 3. Marks above 3 turn into points, or nothing on a
  closed target.
- `points[team]`, `legs[team]`.
- `order`, `turn`, `currentPlayer`, `round`, `phase`, `winner`, as in X01.
- Per seat: `marksScored` (only marks that open or score count, the usual MPR rule) and
  `dartsThrown`.
- `legVisits: { seat, marks, points, darts }[]` for the details page.

## View

- Per player or team: marks per target, points, legs.
- Per target: `closed` (every team has opened it) and `scorable` for the current thrower.
- `visitLocked`, `winner`, `config.botSpeed` and `teams`: what the bot scheduler
  (`BotCapableView`) and the Teams panel read.

## Schema

- `schema/game-ws-v1.json`: a `CricketGame` def and a `Snapshot` branch.
- `schema/api-v1.yaml`: a `CricketDetail` (per leg: final marks grid, points, visits) in the
  `GameDetail.detail` union.
- Regenerate with `npm run gen:api` at the repo root.

## History and stats

- `matchStats`: MPR, marks per target, 5-, 7- and 9-mark visits, points scored, legs won.
- `summarize`: teams placed by legs won, then points in the open leg (fewer first in
  cut-throat), then targets opened,
  so a forfeit mid-leg still ranks everyone.
- `getLeg` for the details page's leg selector.

## Bots

Reused unchanged: `bots/scheduler.ts`, `throwAt`, `sigmaForLevel`, `pacing.ts`, and
`isBotCapable` (bot seats show up once the module defines `botTarget`).

New:

- Export `pointFor(label)` from `bots/accuracy.ts`.
- `botTarget` returns `pointFor(cricketTarget(state, team))`, or `'takeout'` after three darts
  or once the leg is won.
- `cricketTarget` runs before every dart, so dart 2 sees what dart 1 did:
  - **Standard:** if behind on points and holding a target that still scores, aim the
    treble of the highest one. Otherwise close the highest target an opponent scores on,
    then the highest one not yet opened. The bull comes last, aimed at the bullseye.
  - **Cut-throat:** close any target where an opponent can add points to us, then score on
    targets opponents haven't opened, then close the rest.
- The bot's level means the same accuracy as in X01. It isn't recalibrated to MPR.

The lobby shows a bot's X01 average (`"{n} avg"`) in `lobby/AddBot.svelte`,
`lobby/TeamsPanel.svelte` and `lobby/BoardLabel.svelte`. Those show the average only when
the lobby's game is X01, and `"Level {n}"` for any other game.

## UI

Canvas artboards come first and are reviewed before any Svelte work. They're based on the
Match and X01 boards and follow the layout rule (2 players: board centred, a panel each side;
3 or more: board to the side, stacked rows):

- `Cricket-Duel`: the marks grid down the middle (`/`, `X`, `⊗`), targets highlighted on the
  board, closed targets dimmed.
- `Cricket-Party`: 3 or more players or teams.
- `Cricket-Result`.
- `Cricket-Details`: MPR, marks per target, leg selector, final grid per leg.
- `Mobile-Cricket`.

Frontend:

- `lib/gameViews/`: header title and meta line (mode, first to N).
- `lib/components/cricket/`: grid, player and team panels; picked by game id in
  `GameDisplay.svelte`.
- Board highlights: targets still needed are lit, scorable ones tinted, closed ones dimmed.
- `lib/gameModes.ts`: the mode with `flag: 'gamemode.cricket.enabled'`.
- Details page: the generic `matchStats` rows plus a Cricket leg section.

## Flag

`gamemode.cricket.enabled` in `backend/src/flags/definitions.ts`, on for admins by default,
like `gamemode.hilo.enabled`.

## Testing

- `cricketRules.test.ts`: marks per dart (bull, misses), opening, scoring, closing, standard
  scoring with 3 or more players, cut-throat points, the leg ending mid-visit, and the
  opened-everything-but-behind case.
- `cricket.test.ts`: a full game through the reducer, legs and the leg starter, teams sharing
  marks, forfeit placements, and replaying a corrected dart.
- Bot: a table of `cricketTarget` cases (behind, ahead, defending, bull last, cut-throat) and a
  seeded bot-vs-bot game that finishes.
- The existing `detail.contract` and `index` tests cover the new module.
- One e2e pass in the real app; a screenshot under `docs/cricket/`.

## Delivery

Canvas artboards first. Then one PR with atomic commits:

1. Rules core.
2. Reducer, flag and registration.
3. Schema and generated files.
4. Bot.
5. Frontend and the lobby level labels.
6. Docs and screenshot.
