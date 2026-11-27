# Dungeon: content catalogue

The numbers and effects behind the [Dungeon game spec](2026-11-27-dungeon-design.md): artifacts,
segment items, classes, enemies and the balance tables. This is a snapshot of the live content
artifact "Dartcade Dungeon: Artifacts, Classes, Enemies" (working draft v4, taken 2026-11-26).
Christoph keeps editing that artifact, so it wins where the two differ.

**Where the design canvas disagrees with this file, this file wins.** The artboards use made-up
effects for a few artifacts so the damage popup has something to show (see
[Placeholders in the design](2026-11-27-dungeon-design.md#placeholders-in-the-design)).

Status is the one set in the artifact: `accepted` (wanted), `draft` (not yet reviewed) or
`rejected` (do not build). Build `accepted` and `draft` entries; skip `rejected` ones. `Ricochet Flight`
is new (decided 2026-11-27) and is not in the artifact yet.

## Terms

- **Visit**: one player's 3 darts (4 with Golden Dart).
- **Round**: every living hero's visit, then the enemies act.
- **Number**: a board number with its single, double and treble areas. Segment items sit on a Number
  for the rest of the run. Each Number holds 1 item by default (2 with Mason's Trowel). Some items
  can be placed on one ring only (a smaller target, so a stronger effect).
- **Burn**: damage at the end of each round, stacks.
- **Chill**: the enemy's attacks do 25% less.
- **Block**: absorbs damage, resets each round (unless Tower Shield).
- Artifact effects count per player unless stated.

## Artifacts

Owned per player. Rarity order: common, uncommon, rare, epic, legendary.

| Name                | Rarity    | Status   | Effect                                                                                               | Note                                                                         |
| ------------------- | --------- | -------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Pin Cushion         | common    | accepted | Each dart on the same segment as your previous dart deals +10 damage.                                | Grouping. Combos with Piercing Sword.                                        |
| Shotgun Shell       | common    | accepted | Each dart on a different segment than your previous dart deals +8 damage.                            | Spread. Opposite of Pin Cushion.                                             |
| Twin Buckler        | common    | draft    | Every double you hit also gives you 8 block.                                                         | Rings + defense.                                                             |
| Spring Boots        | common    | rejected | Missing the board gives 15 block.                                                                    |                                                                              |
| Piercing Sword      | uncommon  | accepted | Double damage when all three darts hit the same segment.                                             | Grouping payoff. Combos with Pin Cushion.                                    |
| Knife Fan           | uncommon  | accepted | Three darts on three different segments: this visit deals +50% damage.                               | Spread payoff. Combos with Shotgun Shell.                                    |
| Signet Ring         | uncommon  | rejected | Hit a single, a double and a treble (any segments) in one visit: deal 50 bonus damage.               |                                                                              |
| Counterweight       | uncommon  | accepted | A dart on the opposite segment of your previous dart gives 15 block.                                 | Wide-board play (20 then 3).                                                 |
| Ember Pendant       | uncommon  | draft    | Each consecutive dart in the same ring deals +6 more than the last.                                  | Consistency. Doubles-only runs.                                              |
| Tinderbox           | uncommon  | accepted | Trebles apply Burn: 10 damage at the end of each round, stacking.                                    | Treble hunters. Rewards early fight hits.                                    |
| Brass Magnifier     | uncommon  | draft    | Hits on the inner single (the area between the bull and the treble ring) deal x1.5 damage.           | Skill reward for aiming small.                                               |
| Frostbite Dagger    | rare      | draft    | Doubles apply Chill (enemy attacks -25%). A treble on a chilled enemy shatters it for x2.            | Doubles set up, trebles finish. Combos with Tinderbox.                       |
| Mirror Shard        | rare      | accepted | A dart on the opposite segment of your previous dart repeats that previous dart's damage.            | Wide spread. Combos with Counterweight.                                      |
| Clockwork Gear      | rare      | accepted | Each dart on the next segment clockwise from your previous dart gains +15 damage, stacking per link. | Walking the board (20, 1, 18).                                               |
| Sharpshooter Glove  | rare      | accepted | A (single) bull makes your next dart this visit a guaranteed critical (x2).                          | Bull first, then follow up.                                                  |
| Spiked Buckler      | rare      | accepted | Your last dart each visit deals bonus damage equal to your current block.                            | Defense becomes offense. Combos with Twin Buckler.                           |
| Blood Altar         | rare      | draft    | Lose 5 HP at the start of each visit. All your damage is +50%.                                       | Risk. Pairs with healing.                                                    |
| Linked Chain        | rare      | draft    | A dart on the same segment an ally hit this round deals +15, and the ally gains 10 block.            | Co-op.                                                                       |
| Tower Shield        | epic      | draft    | Your block no longer resets at the end of a round; it stays until enemies chew through it.           | Turtle builds. Powers Spiked Buckler. Replaces Guardian's 50% carry-over.    |
| Shanghai Pot        | epic      | draft    | Deal x10 damage when you hit the single, double and treble of the same segment in one visit.         | Hard but huge.                                                               |
| Pyramid             | epic      | draft    | After each visit, deal damage based on the area of the triangle your darts made (0 if one missed).   | Spread payoff. Uses board coordinates.                                       |
| Miniature Staircase | epic      | draft    | Three darts in ascending segment order (5, 12, 18) deal x3 damage.                                   | Throw order. Combos with Clockwork Gear.                                     |
| Crown               | epic      | draft    | Hit 20, 1 and 18 (the top three) in one visit: x4 damage.                                            | Precision at the top of the board.                                           |
| Echo Bell           | epic      | accepted | A bull repeats the damage of your previous dart twice (single bull), three times (inner).            | Bull plus a treble. Combos with Sharpshooter Glove.                          |
| Bullseye Idol       | epic      | accepted | Bull heals the whole party for 10 and gives each ally 15 block.                                      | Support bull players.                                                        |
| Mason's Trowel      | legendary | draft    | Every number can hold 2 segment items instead of 1 (+1 slot per number).                             | Build-around for segment items.                                              |
| Golden Dart         | legendary | draft    | You throw 4 darts per visit.                                                                         | Boosts every grouping, spread and chain effect.                              |
| Trinity Medallion   | legendary | draft    | If all three darts of a visit are trebles, defeat any non-boss enemy outright.                       | Treble-only runs.                                                            |
| Phoenix Feather     | legendary | draft    | Once per run, when you drop to 0 HP, revive at 50%.                                                  | Safety net for risky builds.                                                 |
| Storm Lantern       | legendary | draft    | Your first dart each visit triggers all artifacts twice.                                             | Combo engine.                                                                |
| Ricochet Flight     | legendary | new      | Overkill is not wasted: damage beyond a kill carries over to the next enemy.                         | Decided 2026-11-27: carry-over is off by default, this artifact turns it on. |

## Segment items

Placed on a Number (or a ring, where noted) for the rest of the run.

| Name            | Rarity    | Status   | Effect                                                                                                                                | Note                                         |
| --------------- | --------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Whetstone Rune  | common    | draft    | [Number] Hits here deal +10 damage.                                                                                                   | Put it on a number you hit often.            |
| Spring Tile     | common    | draft    | [Number] Hitting it heals you for 6 HP.                                                                                               | Healer players. Put it on an easy number.    |
| Stone Wall      | common    | draft    | [Number] Hitting it gives 10 block.                                                                                                   | Pairs with Spiked Buckler.                   |
| Whetstone Stack | uncommon  | draft    | [Number] Hits here deal +1 on a single, +5 on a double and +10 on a treble. Each copy placed on the same number adds the bonus again. | Pile several on your best number.            |
| Bumper          | uncommon  | draft    | [Number] A hit here also counts as a half hit on both neighbors.                                                                      | Fills in misses.                             |
| Spiked Tile     | uncommon  | draft    | [Number] Hits here apply Burn (8 per round).                                                                                          | Combos with Tinderbox.                       |
| Lucky Clover    | uncommon  | draft    | [Number] +1 Multiplier.                                                                                                               | Strong on small segments, weak on big ones.  |
| Cursed Tile     | rare      | draft    | [Number] Damage x2, but you lose 5 HP each time you hit it.                                                                           | Pairs with Blood Altar and healing.          |
| Mirror Tile     | rare      | accepted | [Number] A hit here also counts on the opposite number.                                                                               | Combos with Mirror Shard and Counterweight.  |
| Gold Tile       | rare      | rejected | [Number] Hits here earn 5 gold.                                                                                                       |                                              |
| Magnet          | epic      | draft    | [Number] Darts landing on its two neighbors count as hitting this number instead.                                                     | Enlarges a target.                           |
| Ring Anvil      | epic      | draft    | [Ring] Choose a ring (double or treble) of a number: hits on that ring deal x2.                                                       | Works with Archer and Mage.                  |
| Portal          | epic      | draft    | [Number] Two linked numbers: a dart on either counts as hitting both.                                                                 | Combos with Shanghai Pot and Piercing Sword. |
| Dormant Bomb    | legendary | draft    | [Number] Each hit charges it. At 3 charges it explodes for 150 damage to all enemies and resets.                                      | Fast-clearing swarms.                        |

## Classes

One per player, chosen at the start of the run.

| Class    | Rarity   | Effect                                                                          | Note                           |
| -------- | -------- | ------------------------------------------------------------------------------- | ------------------------------ |
| Archer   | epic     | Doubles deal x4 damage. Treble damage -25%.                                     | Precision player.              |
| Brawler  | uncommon | Singles deal x1.5 damage; +20% max HP.                                          | Forgiving, tanky.              |
| Mage     | rare     | Trebles chain: also deal 50% to a second enemy.                                 | Pairs with spread-out targets. |
| Guardian | rare     | Keep 50% of unused block each round; hitting an ally's number gives them block. | Support tank.                  |
| Healer   | rare     | Pick a segment at run start: hitting it heals the party for 10.                 | Segment choice is the skill.   |

## Enemies

HP and damage in the table are the base values (1 player, Medium). Scale them as in
[Balance](#balance).

| Name                    | Rarity    | HP  | Weak to            | Resists          | Immune to                         | Attack                                                   | Note                                                                                                                                                                              |
| ----------------------- | --------- | --- | ------------------ | ---------------- | --------------------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Slime                   | common    | 60  | 19                 | 5, 20            |                                   | 6 damage every round                                     | Tutorial enemy.                                                                                                                                                                   |
| Skeleton                | common    | 90  | Doubles            |                  | 7, 3                              | 8 damage every round                                     | Teaches immunities.                                                                                                                                                               |
| Armored Knight          | uncommon  | 120 | Trebles            | Singles          |                                   | 14 damage every 2 rounds                                 | Only trebles do real damage, singles deal 1. Armor tier.                                                                                                                          |
| Ghost                   | uncommon  | 100 | Doubles            | Singles, trebles |                                   | 8 damage, ignores block                                  | Ignores your block. Doubles hunters.                                                                                                                                              |
| Chameleon               | rare      | 150 | Changes each round |                  |                                   | 10 damage every round                                    | Its weak segment changes every round, shown by the lights.                                                                                                                        |
| Shield Bearer           | rare      | 140 | Bull               |                  | The shielded segment until broken | 10 damage every round                                    | Shield on segment X must be broken first, then it takes damage.                                                                                                                   |
| Marble Bust             | rare      | 100 | Exact finish       | Overkill (bust)  |                                   | 8 damage to every player every 2 rounds (falling rubble) | Only breaks when brought to exactly 0 HP, like a checkout. Overshooting is a bust: that visit's damage to it is cancelled and it recovers 20 HP. Rewards planning the last darts. |
| Dungeon Warden (Boss 1) | legendary | 600 | Bull (phase 3)     | Singles          | 1, 5, 20 (phase 2)                | 25 damage strike every 2 rounds                          | 3 phases: swarm, armored, then a bull-only core. Act 1 boss placeholder.                                                                                                          |

## Balance

Tuned for a casual player who scores about 30 to 40 per visit (180 is the maximum) and has about 80
HP. An early enemy should die in roughly 2 visits.

Difficulty (HP and damage multipliers apply on top of the player-count scaling):

| Level  | HP x | Damage x | Average per visit | Note                                |
| ------ | ---- | -------- | ----------------- | ----------------------------------- |
| Easy   | 0.7  | 0.7      | under 25          | Forgiving first runs.               |
| Medium | 1.0  | 1.0      | 25 to 45          | Baseline all numbers are tuned for. |
| Hard   | 1.4  | 1.3      | 45 to 60          | Needs synergy builds.               |
| Expert | 1.8  | 1.6      | above 60          | Needs a good build and good aim.    |

Player-count scaling of enemy HP:

| Players | HP x | Note                                                                                              |
| ------- | ---- | ------------------------------------------------------------------------------------------------- |
| 1       | 1.0  |                                                                                                   |
| 2       | 1.6  |                                                                                                   |
| 3       | 2.4  | Elites and bosses get one extra attack per round on a second target (see the spec's open points). |
| 4       | 3.2  | Bosses gain an extra phase or adds instead of more HP alone.                                      |

The rule behind it: HP = base x 0.8 x players, never below base. Damage per attack does not scale
with players. Example: a Skeleton for 3 players on Medium has 90 x 2.4 = 216 HP, a Slime 60 x 2.4 = 144.

Auto difficulty: suggest a level from the party's average visit score over recent games; the party
can override. The multiplier is roughly the average divided by 35, clamped between 0.7 and 1.8, and
applies on top of the player-count scaling.
