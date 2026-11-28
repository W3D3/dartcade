<script lang="ts">
  // A fight, an elite or the boss (Dungeon-Pixel-Battle, -Boss, -Damage and their phone boards). Left:
  // the battle stage (party against enemies), then the thrower's artifacts and the log, or, once the
  // visit resolved, the damage popup playing its trace (the plain trace under Details, for screen
  // readers and reduced motion). Right: the target, the board with each dart's segment lit and the
  // segment items, the darts (tap one to correct it), Undo and Next. Phones stack it all and hide the
  // board while the popup plays. The boss fight opens behind its entrance screen until Fight or a dart.
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
    toKill,
    traceLines,
  } from '$lib/dungeon/battle'
  import { visitTarget } from '$lib/dungeon/popup'
  import { PopupPlayer } from '$lib/dungeon/popupPlayer.svelte'
  import { isArtifactId } from '$shared/dungeon/content/artifacts'
  import { hitOf } from '$shared/dungeon/hit'
  import { CircleDollarSign } from '@lucide/svelte'
  import ArtifactIcon from './ArtifactIcon.svelte'
  import BattleStage from './BattleStage.svelte'
  import BossIntro from './BossIntro.svelte'
  import DamagePopup from './DamagePopup.svelte'
  import VisitPanel from './VisitPanel.svelte'

  let {
    game,
    battle,
    names,
    ...controls
  }: MatchControls & { game: DungeonGame; battle: NonNullable<DungeonGame['battle']>; names: string[] } = $props()

  const boss = $derived(battle.room === 'boss')
  const compact = $derived(controls.layout === 'phone' || controls.layout === 'portrait')
  const thrower = $derived(names[game.currentPlayer] ?? '')
  const hero = $derived(game.heroes[game.currentPlayer])
  // The trace is this visit's once its last dart resolved it; until then it is the one before
  const resolved = $derived(game.visitLocked && game.trace?.seat === game.currentPlayer && game.currentVisitDarts.length > 0)
  const darts = $derived(game.currentVisitDarts)
  const lit = $derived(darts.map(d => hitOf(d.segment)).flatMap(h => litPath(h.number, h.ring) ?? []))
  const log = $derived(game.trace ? traceLines(game.trace, names[game.trace.seat] ?? '', battle.enemies) : [])
  const enemyLog = $derived(battle.lastEnemyTurn ? enemyTurnLines(battle.lastEnemyTurn, names, battle.enemies) : [])
  const kill = $derived(toKill(battle))
  const event = $derived(fresh(game.lastEvent, game))
  const front = $derived(battle.enemies.find(e => e.uid === battle.target) ?? null)
  const behind = $derived(battle.enemies.filter(e => e.hp > 0 && e.uid !== battle.target))

  // The boss's entrance stays up until Fight or a dart, once per boss fight
  let fought = $state<number | null>(null)
  const intro = $derived(boss && battle.round === 1 && game.trace === null && darts.length === 0 && fought !== game.cleared)

  // The popup plays the resolved visit's trace; a corrected dart or the next visit is a new trace
  const trace = $derived(resolved ? game.trace : null)
  const player = new PopupPlayer(() =>
    trace
      ? { trace, key: `${game.cleared}:${battle.round}:${trace.seat}:${trace.darts.map(d => `${d.number}${d.ring}${d.damage}`).join()}` }
      : null,
  )
  const popup = $derived(player.popup)
  const running = $derived(player.running)
  const skip = () => player.skip()
  // The view's target has moved on once the visit killed the front enemy: the popup and, while it
  // plays, the stage keep the one the visit hit
  const struck = $derived(trace ? visitTarget(trace) : null)
  const stageFront = $derived(running && struck ? struck : battle.target)
</script>

<!-- On click, not pointerdown: skipping moves the layout, and a tap on Next must land first -->
<svelte:window onclick={skip} onkeydown={(e: KeyboardEvent) => e.key === 'Escape' && skip()} />

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

<main class="dg-theme flex h-full flex-col gap-3 overflow-y-auto bg-dg-bg p-3 text-dg-text lg:px-5 lg:py-3.5" data-testid="dungeon-battle">
  {#if intro && front}
    <BossIntro {game} boss={front} {names} onfight={controls.viewOnly ? null : () => (fought = game.cleared)} />
  {:else}
    <div class="flex min-w-0 flex-col gap-3 lg:grid lg:grid-cols-[minmax(0,860fr)_minmax(0,520fr)] lg:items-start lg:gap-5">
      <!-- phones: the artifacts and the log go under the board (contents lets them reorder) -->
      <div class="flex min-w-0 flex-col gap-3 max-lg:contents">
        <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
          {#if boss}<span class="rounded-md bg-dg-hp px-2 font-display text-sm font-bold text-dg-text uppercase">Boss</span>{/if}
          <span class="text-dg-muted">Floor {game.floor} of {game.floors}</span>
          <span
            class="inline-flex h-[34px] items-center rounded-xl border-2 border-dg-gold bg-dg-bg px-2.5 font-display text-lg font-bold tracking-wide text-dg-gold uppercase"
          >
            Round {battle.round}
          </span>
          <span class="ml-auto inline-flex items-center gap-1.5 text-lg text-dg-gold"
            ><CircleDollarSign class="size-5" aria-hidden="true" />{game.gold}</span
          >
        </div>

        <BattleStage
          {game}
          {battle}
          {names}
          {popup}
          front={stageFront}
          cue={player.cue}
          before={trace ? Object.fromEntries(trace.enemies.map(e => [e.uid, e.hpBefore])) : null}
          {compact}
        />

        {#if popup && trace}
          <div class="flex flex-col gap-2">
            <DamagePopup
              {popup}
              thrower={names[trace.seat] ?? ''}
              target={enemyName(battle.enemies.find(e => e.uid === struck)?.kind ?? '')}
              {compact}
            />
            {#if running}
              <button type="button" class="self-end text-sm text-dg-muted underline-offset-2 hover:underline" onclick={skip}
                >Tap anywhere to skip</button
              >
            {/if}
            <details class="rounded-xl border border-dg-line bg-[#0e0a14] px-4 py-2 text-dg-text">
              <summary class="cursor-pointer text-sm text-dg-muted">Details</summary>
              <ol class="mt-1 flex flex-col gap-1 p-0" data-testid="trace">
                {#each log as line, i (i)}<li>&gt; {line}</li>{/each}
              </ol>
            </details>
          </div>
        {:else}
          {#if hero.artifacts.length}
            <div
              class="flex flex-wrap items-center gap-x-3.5 gap-y-1 rounded-xl border border-dg-line bg-dg-panel px-3 py-2 max-lg:order-last"
            >
              <span class="font-display text-lg font-bold tracking-wide uppercase">{thrower}</span>
              <span class="text-dg-muted">Artifacts</span>
              <span class="flex flex-wrap gap-2 sm:ml-2">
                {#each hero.artifacts.filter(isArtifactId) as a (a)}<ArtifactIcon id={a} owner={thrower} />{/each}
              </span>
            </div>
          {/if}
          <section
            class="flex flex-col gap-1 rounded-xl border border-[#6f6285] bg-[#0e0a14] px-4 py-2.5 max-lg:order-last"
            aria-label="Battle log"
            role="status"
          >
            {#if log.length}
              <h3 class="sr-only">Last visit</h3>
              <ol class="flex flex-col gap-1 p-0" data-testid="trace">
                {#each log as line, i (i)}<li>&gt; {line}</li>{/each}
              </ol>
            {/if}
            {#if enemyLog.length}
              <h3 class="sr-only">Enemy turn</h3>
              <ol class="flex flex-col gap-1 p-0 text-dg-muted" data-testid="enemy-turn">
                {#each enemyLog as line, i (i)}<li>&gt; {line}</li>{/each}
              </ol>
            {/if}
            {#if event}
              <h3 class="sr-only">Event</h3>
              <ol class="flex flex-col gap-1 p-0 text-dg-muted" data-testid="event-outcome">
                {#each eventOutcomeLines(event, names) as line, i (i)}<li>&gt; {line}</li>{/each}
              </ol>
            {/if}
            <p class="text-dg-muted">&gt; Darts always hit the front enemy. When it dies, the next one steps up.</p>
          </section>
        {/if}
      </div>

      <section class="flex min-w-0 flex-col gap-2.5" aria-label="Visit">
        <div class="flex flex-wrap items-baseline justify-between gap-x-2.5">
          <span class="font-display text-xl font-bold tracking-wide text-dg-gold uppercase">
            {front ? `Target · ${enemyName(front.kind)}` : 'No target left'}
          </span>
          <span class="text-sm text-dg-muted">
            {running
              ? 'Tap anywhere to skip'
              : `${thrower} throws${behind.length ? ` · then the ${enemyName(behind[0]?.kind ?? '')}` : ''}`}
          </span>
        </div>
        <VisitPanel
          {...controls}
          {darts}
          damage={resolved && game.trace ? game.trace.darts.map(d => d.damage) : null}
          {overlay}
          hideBoard={running && controls.layout === 'phone'}
        >
          {#if !resolved && kill !== null}
            <p class="text-center text-sm text-dg-muted">{kill} to kill the front enemy · extra is wasted</p>
          {/if}
        </VisitPanel>
      </section>
    </div>
  {/if}
</main>
