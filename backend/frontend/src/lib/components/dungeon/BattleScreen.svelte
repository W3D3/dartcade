<script lang="ts">
  // A fight, an elite or the boss (Dungeon-Pixel-Battle, -Boss, -Damage and their phone boards): the
  // party on the left, the enemies with HP, intent and status on the right, the board in the middle
  // with each dart's segment lit and the segment items on their numbers. Under the board the visit's
  // darts (tap one to correct it), Undo and Next, and the log: the resolved visit as one line per dart
  // and what the enemies did in their turn. Phones stack enemies, party, board, log.
  // shortcut: plain cards; the animated damage popup and the artboards' exact styling come with the
  // polish PR
  import type { DungeonGame } from '$lib/api/game-ws'
  import type { MatchControls } from '$lib/components/match/types'
  import {
    contentName,
    enemyName,
    enemyTurnLines,
    eventOutcomeLines,
    fresh,
    itemSpot,
    litPath,
    spotsText,
    toKill,
    traceLines,
  } from '$lib/dungeon/battle'
  import { CLASS_COLOR } from '$lib/dungeon/view'
  import { CLASSES, isClassId } from '$shared/dungeon/content/classes'
  import { isEnemyId } from '$shared/dungeon/content/enemies'
  import { hitOf } from '$shared/dungeon/hit'
  import HpBar from './HpBar.svelte'
  import PixelSprite from './PixelSprite.svelte'
  import VisitPanel from './VisitPanel.svelte'

  let {
    game,
    battle,
    names,
    ...controls
  }: MatchControls & { game: DungeonGame; battle: NonNullable<DungeonGame['battle']>; names: string[] } = $props()

  const boss = $derived(battle.room === 'boss')
  const thrower = $derived(names[game.currentPlayer] ?? '')
  // The trace is this visit's once its last dart resolved it; until then it is the one before
  const resolved = $derived(game.visitLocked && game.trace?.seat === game.currentPlayer && game.currentVisitDarts.length > 0)
  const darts = $derived(game.currentVisitDarts)
  const lit = $derived(darts.map(d => hitOf(d.segment)).flatMap(h => litPath(h.number, h.ring) ?? []))
  const log = $derived(game.trace ? traceLines(game.trace, names[game.trace.seat] ?? '', battle.enemies) : [])
  const enemyLog = $derived(battle.lastEnemyTurn ? enemyTurnLines(battle.lastEnemyTurn, names, battle.enemies) : [])
  const kill = $derived(toKill(battle))
  const event = $derived(fresh(game.lastEvent, game))
</script>

{#snippet overlay()}
  {#each lit as d, i (i)}
    <path {d} fill="var(--color-dg-gold)" fill-opacity="0.6" stroke="var(--color-dg-gold)" stroke-width="0.01" data-testid="lit-segment" />
  {/each}
  {#each game.items as item, i (i)}
    {@const k = game.items.slice(0, i).filter(p => p.number === item.number).length}
    {@const at = itemSpot(item.number, k)}
    {#if at}
      <circle cx={at.x} cy={at.y} r="0.045" fill="var(--color-ice)" stroke="var(--color-dg-bg)" stroke-width="0.01">
        <title>{contentName(item.item)} on {item.number}</title>
      </circle>
    {/if}
  {/each}
{/snippet}

<main class="flex h-full flex-col gap-3 overflow-y-auto bg-dg-bg p-3 text-dg-text md:p-4" data-testid="dungeon-battle">
  <header class="flex flex-wrap items-baseline justify-between gap-2">
    <h2 class="font-display text-xl font-bold uppercase">
      {#if boss}<span class="mr-2 rounded-sm bg-dg-hp px-1.5 text-sm text-dg-text">Boss</span>{/if}Floor {game.floor} of {game.floors}
    </h2>
    <span class="font-display text-lg font-bold uppercase">Round {battle.round}</span>
    <span class="text-dg-gold">{game.gold} gold</span>
  </header>

  <div class="flex min-w-0 flex-col gap-3 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,28rem)_minmax(0,1fr)] lg:items-start">
    <section class="order-2 flex min-w-0 flex-col gap-2 lg:order-1" aria-label="Party">
      {#each game.heroes as h (h.seat)}
        <div
          class="flex flex-col gap-1 rounded-lg border bg-dg-panel p-2 {h.seat === game.currentPlayer
            ? 'border-dg-gold'
            : 'border-dg-line'} {h.hp === 0 ? 'opacity-50' : ''}"
          data-testid="hero"
        >
          <div class="flex items-center gap-2">
            {#if h.classId && isClassId(h.classId)}<PixelSprite id={h.classId} scale={2} />{/if}
            <span class="min-w-0 flex-1 truncate font-display font-bold uppercase">{names[h.seat]}</span>
            <span class="shrink-0 text-sm">{h.hp}/{h.maxHp}</span>
            {#if h.block}<span class="shrink-0 text-sm text-dg-block">{h.block} block</span>{/if}
          </div>
          <HpBar hp={h.hp} maxHp={h.maxHp} colour={h.classId && isClassId(h.classId) ? CLASS_COLOR[h.classId] : undefined} />
          <span class="truncate text-xs text-dg-muted">
            {h.classId && isClassId(h.classId) ? CLASSES[h.classId].name : ''}{h.artifacts.length
              ? ` · ${h.artifacts.map(contentName).join(', ')}`
              : ''}
          </span>
        </div>
      {/each}
    </section>

    <section class="order-3 flex min-w-0 flex-col gap-2 lg:order-2" aria-label="Visit">
      <p class="text-center font-display text-lg font-bold uppercase">
        {resolved ? `${thrower}: ${game.trace?.total ?? 0} damage` : `${thrower} throws`}
      </p>
      <VisitPanel {...controls} {darts} damage={resolved && game.trace ? game.trace.darts.map(d => d.damage) : null} {overlay}>
        {#if !resolved && kill !== null}
          <p class="text-center text-sm text-dg-muted">{kill} to kill the front enemy · extra is wasted</p>
        {/if}
      </VisitPanel>
    </section>

    <section class="order-1 flex min-w-0 flex-col gap-2 lg:order-3" aria-label="Enemies">
      {#each battle.enemies as e (e.uid)}
        <div
          class="flex flex-col gap-1 rounded-lg border bg-dg-panel p-2 {e.uid === battle.target
            ? 'border-dg-hp'
            : 'border-dg-line'} {e.hp === 0 ? 'opacity-40' : ''}"
          data-testid="enemy"
        >
          <div class="flex items-center gap-2">
            {#if isEnemyId(e.kind)}<PixelSprite id={e.kind} scale={2} flip />{/if}
            <span class="min-w-0 flex-1 truncate font-display font-bold uppercase">
              {enemyName(e.kind)}{#if e.uid === battle.target}<span class="ml-1 text-xs text-dg-hp">· target</span>{/if}
            </span>
            <span class="shrink-0 text-sm">{e.hp}/{e.maxHp}</span>
          </div>
          <HpBar hp={e.hp} maxHp={e.maxHp} />
          {#if e.hp > 0}
            <span class="text-sm">
              Next: {e.intent.name}{e.intent.kind === 'attack'
                ? ` · ${e.intent.value} damage${e.intent.pierce ? ', pierces block' : ''}`
                : ''}
              {#if e.burn}<span class="text-warn"> · Burn {e.burn}</span>{/if}
              {#if e.chilled}<span class="text-ice"> · Chilled</span>{/if}
            </span>
            {#if e.weak.length || e.resist.length || e.immune.length}
              <span class="text-xs text-dg-muted">
                {[
                  e.weak.length ? `Weak: ${spotsText(e.weak)}` : '',
                  e.resist.length ? `Resists: ${spotsText(e.resist)}` : '',
                  e.immune.length ? `Immune: ${spotsText(e.immune)}` : '',
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            {/if}
          {/if}
        </div>
      {/each}
    </section>
  </div>

  <section class="flex flex-col gap-1 rounded-lg border border-dg-line bg-dg-panel p-3 font-mono text-sm" aria-label="Battle log">
    {#if log.length}
      <h3 class="font-display text-sm font-bold uppercase text-dg-muted">{resolved ? 'This visit' : 'Last visit'}</h3>
      <ol class="flex flex-col gap-0.5" data-testid="trace">
        {#each log as line, i (i)}<li>&gt; {line}</li>{/each}
      </ol>
    {/if}
    {#if enemyLog.length}
      <h3 class="mt-1 font-display text-sm font-bold uppercase text-dg-muted">Enemy turn</h3>
      <ol class="flex flex-col gap-0.5" data-testid="enemy-turn">
        {#each enemyLog as line, i (i)}<li>&gt; {line}</li>{/each}
      </ol>
    {/if}
    {#if event}
      <h3 class="mt-1 font-display text-sm font-bold uppercase text-dg-muted">Event</h3>
      <ol class="flex flex-col gap-0.5" data-testid="event-outcome">
        {#each eventOutcomeLines(event, names) as line, i (i)}<li>&gt; {line}</li>{/each}
      </ol>
    {/if}
    {#if !log.length && !enemyLog.length && !event}
      <p class="text-dg-muted">Darts hit the front enemy. When it dies, the next one steps up.</p>
    {/if}
  </section>
</main>
