<!--
  The mission match screen (Mission-Play, Tablet-Mission-Play, Mission-Play-Phone). Side by side: the
  player up's step panel (and a row per other player), the board with This visit, the visit's darts
  and the controls, then the mission's panel: the clock, the steps (Switch, any order) and the
  highscores, Pause and Give up. Phones and portrait screens stack: the steps strip, the step panel,
  the board, This visit, the darts and the controls.
  The clock is the player up's: the server's time of each input (MissionClock), counted down here; at
  0 the screen sends mission_clock, which ends that player's run and hands the turn on.
-->
<script lang="ts">
  import { Pause, Play } from '@lucide/svelte'
  import { DropdownMenu } from 'bits-ui'
  import type { MissionGame, UserAction } from '$lib/api/game-ws'
  import ConfirmModal from '$lib/components/ConfirmModal.svelte'
  import ControlBar from '$lib/components/ControlBar.svelte'
  import Avatar from '$lib/components/Avatar.svelte'
  import TurnStatusBar from '$lib/components/TurnStatusBar.svelte'
  import BoardOrKeypad from '$lib/components/match/BoardOrKeypad.svelte'
  import MatchFrame from '$lib/components/match/MatchFrame.svelte'
  import type { MatchControls } from '$lib/components/match/types'
  import type { Who } from '$lib/face'
  import {
    bestValue,
    boardTarget,
    chipLabel,
    CLOCK_RETRY_MS,
    CLOCK_WARN_MS,
    fmtClock,
    liveElapsed,
    runLine,
    signed,
    stepState,
    timeLeft,
  } from '$lib/missions/view'
  import { tick } from '$lib/now'
  import { stepTitle } from '$shared/missions/describe'
  import MissionStepPanel from './MissionStepPanel.svelte'
  import MissionStepsList from './MissionStepsList.svelte'

  let {
    game,
    who,
    viewerId,
    layout,
    canThrow,
    locked,
    canUndo,
    next,
    onUndo,
    onNext,
    onBoardClick,
    onCorrect,
    onDartMove,
    send,
    myTurn,
    keypad = false,
    onDart = () => {},
    viewOnly = false,
    turn = null,
  }: {
    game: MissionGame
    /** Per seat: its name and picture. */
    who: Who[]
    /** "You" in the highscores. */
    viewerId: string | null
    send: (action: UserAction) => void
    /** The viewer may act for the player up: their darts, Switch, Pause and Give up. */
    myTurn: boolean
  } & MatchControls = $props()

  const cp = $derived(game.currentPlayer)
  const run = $derived(game.runs[cp])
  const step = $derived(game.mission.steps[run.active])
  const solo = $derived(game.runs.length === 1)
  const playing = $derived(run.status === 'playing')
  // A waiting player's clock stops too, but the player up's stops only when they pause it
  const paused = $derived(playing && run.clock.pausedAt !== null)
  const between = $derived(playing && game.chips.length === 0)
  const acts = $derived(myTurn && !viewOnly && playing)
  const canSwitch = $derived(acts && between && !paused && game.mission.order === 'any')
  const switchable = $derived(game.mission.steps.map((_, i) => i).filter(i => i !== run.active && stepState(run, i) !== 'done'))
  const canPause = $derived(acts && between && game.mission.pause && run.clock.startedAt !== null)

  const clockMs = $derived(liveElapsed(run, $tick))
  const left = $derived(timeLeft(game, run, $tick))
  const limit = $derived(game.mission.timeLimit === undefined ? null : game.mission.timeLimit * 1000)
  const warn = $derived(left !== null && left <= CLOCK_WARN_MS)
  const clockText = $derived(fmtClock(left ?? clockMs))
  const clockLabel = $derived(
    `${solo ? 'Mission time' : `${who[cp]?.name}'s time`}: ${left === null ? `${clockText} so far` : `${clockText} left of ${fmtClock(limit ?? 0)}`}`,
  )

  // The countdown reached 0: the server checks the time and ends the run. This device's clock may run
  // ahead of the server's, which then finds time left: ask again until a snapshot says the run is over
  const expired = $derived(acts && run.clock.deadline !== null && left === 0)
  $effect(() => {
    if (!expired) return
    const ask = () => send({ type: 'mission_clock' })
    ask()
    const id = setInterval(ask, CLOCK_RETRY_MS)
    return () => clearInterval(id)
  })

  const visitGain = $derived(game.chips.reduce((sum, c) => sum + c.gain, 0))
  const darts = $derived(game.currentVisitDarts)
  let openDart = $state<number | null>(null)
  let confirmGiveUp = $state(false)
  const others = $derived(game.runs.map((_, i) => i).filter(i => i !== cp))
  const nextLabel = $derived(solo && next.label === 'Next player' ? 'Takeout · next visit' : next.label)
  const switchTo = (i: number) => send({ type: 'mission_switch', step: i })
</script>

{#snippet board()}
  <BoardOrKeypad
    {keypad}
    {darts}
    {canThrow}
    {locked}
    {canUndo}
    next={{ ...next, label: nextLabel }}
    {onUndo}
    {onNext}
    {onBoardClick}
    {onDart}
    {onCorrect}
    {onDartMove}
    bind:openDart
    board={{ target: playing ? boardTarget(step) : null, dim: playing && boardTarget(step) !== null }}
  />
{/snippet}

{#snippet clockPill(size: 'sm' | 'md')}
  <span
    role="timer"
    aria-label={clockLabel}
    class="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-current bg-surface-active px-2 font-semibold uppercase tracking-cta
      {size === 'sm' ? 'h-5 text-micro' : 'h-7 text-micro'} {warn ? 'text-live' : left === null ? 'text-ink-2' : 'text-clock'}"
    >{left === null ? 'Time' : 'Left'}<span
      class="font-display font-bold normal-case tabular-nums tracking-title {size === 'sm' ? 'text-label' : 'text-lead'}">{clockText}</span
    ></span
  >
{/snippet}

{#snippet chips(tall: boolean)}
  <div class="grid shrink-0 grid-cols-3 gap-2" aria-label="This visit's darts">
    {#each [0, 1, 2] as k (k)}
      {@const c = game.chips[k]}
      {#if c}
        <span
          role="img"
          aria-label="Dart {k + 1}: {chipLabel(c)}, {c.outcome === 'fail' ? 'ends the attempt' : c.gain > 0 ? `+${c.gain}` : 'no progress'}"
          class="flex flex-col items-center justify-center gap-0.5 rounded-xl {tall ? 'h-[clamp(58px,10vh,124px)]' : 'h-[58px]'}
            {c.outcome === 'fail'
            ? 'bg-live-soft text-live-text'
            : c.gain > 0 || c.outcome === 'done'
              ? 'bg-accent text-accent-fg'
              : 'bg-surface-chip text-ink-2'}"
        >
          <span class="font-display font-bold leading-none {tall ? 'text-[clamp(26px,5vh,56px)]' : 'text-section-title'}"
            >{chipLabel(c)}</span
          >
          <span class="font-display font-bold {tall ? 'text-[clamp(14px,2.6vh,26px)]' : 'text-caption'}"
            >{c.outcome === 'fail' ? 'Reset' : c.outcome === 'done' ? 'Done' : signed(c.gain)}</span
          >
        </span>
      {:else}
        <span
          class="flex items-center justify-center gap-2 rounded-xl border-[1.5px] border-dashed border-line-next text-label text-ink-2 {tall
            ? 'h-[clamp(58px,10vh,124px)]'
            : 'h-[58px]'}"
          >{#if k === game.chips.length && playing}<span class="size-2 rounded-full bg-accent"></span>{/if}Dart {k + 1}</span
        >
      {/if}
    {/each}
  </div>
{/snippet}

{#snippet thisVisit(tall: boolean)}
  <div
    role="status"
    aria-label="This visit: {signed(visitGain)}"
    class="relative flex shrink-0 items-center justify-center card {tall ? 'h-[clamp(56px,11vh,104px)]' : 'h-14'}"
  >
    <span class="absolute top-1/2 left-3.5 -translate-y-1/2 text-micro label-caps text-text-muted md:left-5 md:text-small">This visit</span>
    <span class="font-display font-bold leading-[0.85] {tall ? 'text-[clamp(48px,9vh,88px)]' : 'text-page-title'}">{signed(visitGain)}</span
    >
  </div>
{/snippet}

{#snippet switchMenu()}
  {#if canSwitch && switchable.length > 0}
    <DropdownMenu.Root>
      <DropdownMenu.Trigger class="flex h-12 cursor-pointer items-center gap-1 rounded-md px-3 text-label text-text-muted hover:text-text"
        >Switch step ›</DropdownMenu.Trigger
      >
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          class="z-60 flex min-w-[220px] flex-col gap-[2px] rounded-xl border border-line-popover bg-surface-hover p-[6px] [box-shadow:0_18px_44px_rgba(0,0,0,0.55)] outline-none"
        >
          {#each switchable as i (i)}
            <DropdownMenu.Item
              class="flex h-10 cursor-pointer items-center gap-2 rounded-sm px-[10px] text-label outline-none data-highlighted:bg-surface-paused"
              onSelect={() => switchTo(i)}
              ><b class="font-display text-accent">{i + 1}</b>{stepTitle(game.mission.steps[i])}</DropdownMenu.Item
            >
          {/each}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  {/if}
{/snippet}

{#snippet controls(compact: boolean)}
  {#if !viewOnly}
    <div class="flex shrink-0 items-center gap-2">
      <div class="min-w-0 flex-1">
        {#if turn}
          <TurnStatusBar status={turn} {compact} />
        {:else if !keypad}
          <ControlBar {compact} {canUndo} label={nextLabel} prominent={next.prominent} enabled={next.enabled} {onUndo} {onNext} />
        {/if}
      </div>
      {@render switchMenu()}
    </div>
  {/if}
{/snippet}

{#snippet pauseNote()}
  {#if paused && acts}
    <div role="status" class="flex shrink-0 items-center gap-3 rounded-card border border-warn-panel-line bg-warn-panel px-4 py-3">
      <span class="flex-1 text-label text-warn">The clock is paused. Darts don't count until you resume.</span>
      <button
        type="button"
        class="flex h-10 cursor-pointer items-center gap-1.5 rounded-md bg-accent px-3 text-label font-bold text-accent-fg"
        onclick={() => send({ type: 'mission_resume' })}><Play size={15} />Resume</button
      >
    </div>
  {/if}
{/snippet}

{#snippet otherRows()}
  {#if others.length > 0}
    <section aria-label="Other players" class="flex shrink-0 flex-col gap-1.5">
      {#each others as i (i)}
        {@const r = game.runs[i]}
        <div
          class="flex items-center gap-2.5 rounded-xl border border-line bg-surface-1 px-3 py-2 {r.status !== 'playing'
            ? 'opacity-70'
            : ''}"
        >
          <Avatar name={who[i]?.name ?? ''} face={who[i]?.face ?? null} size={28} />
          <span class="flex min-w-0 flex-1 flex-col">
            <span class="truncate text-label font-semibold"
              >{who[i]?.name}{#if game.nextPlayer === i}<span class="ml-2 text-micro font-bold uppercase tracking-wide text-accent"
                  >Next</span
                >{/if}</span
            >
            <span class="truncate text-caption text-text-muted">{runLine(game, r)}</span>
          </span>
          {#if r.status === 'playing'}<span class="font-display text-lead font-bold tabular-nums text-ink-2"
              >{fmtClock(liveElapsed(r, $tick))}</span
            >{/if}
        </div>
      {/each}
    </section>
  {/if}
{/snippet}

{#snippet giveUp()}
  {#if acts}
    <button
      type="button"
      class="h-10 cursor-pointer rounded-md px-2 text-label text-text-muted hover:text-danger-text"
      onclick={() => (confirmGiveUp = true)}>Give up</button
    >
  {/if}
{/snippet}

{#snippet highscores()}
  <section aria-label="Highscores" class="flex min-h-0 flex-col gap-1.5 border-t border-line pt-3">
    <h3 class="text-caption font-semibold label-caps text-text-dim">Highscores</h3>
    {#if game.highscores.length === 0}
      <p class="text-small text-text-muted">No completed runs yet. Set the first time.</p>
    {:else}
      <ol class="flex flex-col overflow-y-auto">
        {#each game.highscores.slice(0, 5) as h, i (i)}
          {@const you = h.userId !== null && h.userId === viewerId}
          <li class="flex h-[30px] items-center gap-3 text-label {you ? 'text-accent' : ''}">
            <span class="w-4 font-display font-bold">{i + 1}</span>
            <span class="min-w-0 flex-1 truncate">{you ? 'You' : h.name}</span>
            <span class="font-display text-lead font-bold">{bestValue(game.mission.rankBy, h)}</span>
          </li>
        {/each}
      </ol>
    {/if}
  </section>
{/snippet}

{#snippet missionPanel()}
  <section
    aria-label="Mission progress"
    class="flex w-[300px] shrink-0 flex-col gap-3.5 overflow-y-auto rounded-panel border border-line bg-surface-panel p-5 xl:w-[360px]"
  >
    <h2 class="type-section-title font-bold leading-none">{game.mission.name}</h2>
    <div role="timer" aria-label={clockLabel} class="flex flex-col gap-2 {warn ? 'text-live' : left === null ? 'text-text' : 'text-clock'}">
      <div class="flex items-baseline gap-2">
        <span class="font-display text-page-title font-bold leading-[0.9] tabular-nums">{clockText}</span>
        <span class="text-small text-text-muted"
          >{left === null
            ? solo
              ? 'so far'
              : `${who[cp]?.name}'s time`
            : `left of ${fmtClock(limit ?? 0)}${solo ? '' : ` · ${who[cp]?.name}`}`}</span
        >
        {#if canPause && !paused}
          <button
            type="button"
            aria-label="Pause the clock"
            class="ml-auto flex size-8 cursor-pointer items-center justify-center rounded-md border border-line-strong text-text"
            onclick={() => send({ type: 'mission_pause' })}><Pause size={15} /></button
          >
        {/if}
      </div>
      {#if left !== null && limit}
        <span class="block h-1.5 overflow-hidden rounded-full bg-surface-paused"
          ><span class="block h-full rounded-full bg-current" style="width: {(100 * left) / limit}%"></span></span
        >
      {/if}
    </div>
    <span class="text-caption label-caps text-text-muted">Steps · {game.mission.order === 'any' ? 'any order' : 'in order'}</span>
    <MissionStepsList {game} seat={cp} {canSwitch} onswitch={switchTo} />
    <div class="mt-auto flex flex-col gap-2">
      {@render highscores()}
      <div class="flex justify-end">{@render giveUp()}</div>
    </div>
  </section>
{/snippet}

{#snippet stepsStrip()}
  <section aria-label="Mission steps" class="flex h-[46px] shrink-0 items-center gap-2 card px-2.5">
    <span class="mr-0.5 text-micro label-caps text-text-dim">Steps</span>
    {#each game.mission.steps as _, i (i)}
      {@const st = stepState(run, i)}
      <span
        aria-label="Step {i + 1}: {st}"
        class="flex h-[30px] flex-1 items-center justify-center rounded-lg font-display text-body font-bold
          {st === 'done'
          ? 'bg-accent text-accent-fg'
          : st === 'active'
            ? 'border-2 border-accent bg-card-active text-accent'
            : st === 'failed'
              ? 'bg-live text-white'
              : 'border border-line-2 bg-surface-active text-ink-2'}">{st === 'done' ? '✓' : st === 'failed' ? '✕' : i + 1}</span
      >
    {/each}
    {@render clockPill('sm')}
  </section>
{/snippet}

{#snippet stacked(phone: boolean)}
  {@render stepsStrip()}
  <MissionStepPanel {game} seat={cp} who={who[cp]} phone />
  {@render pauseNote()}
  {@render otherRows()}
  {@render board()}
  {@render thisVisit(false)}
  {@render chips(false)}
  {@render controls(phone)}
  <div class="flex shrink-0 justify-end">{@render giveUp()}</div>
{/snippet}

{#snippet phoneLayout()}
  {@render stacked(true)}
{/snippet}

{#snippet portraitLayout()}
  {@render stacked(false)}
{/snippet}

{#snippet wide()}
  <div class="flex w-[300px] shrink-0 flex-col gap-3 xl:w-[400px]">
    <MissionStepPanel {game} seat={cp} who={who[cp]} />
    {@render otherRows()}
  </div>
  <div class="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
    {@render pauseNote()}
    {@render board()}
    {@render thisVisit(true)}
    {@render chips(true)}
    {@render controls(false)}
  </div>
  {@render missionPanel()}
{/snippet}

<MatchFrame
  {layout}
  phone={phoneLayout}
  portrait={portraitLayout}
  solo={wide}
  duel={wide}
  party={wide}
  side={{ solo: 'p-5 xl:p-7 flex gap-5', duel: 'p-5 xl:p-7 flex gap-5', party: 'p-5 xl:p-7 flex gap-5' }}
/>

{#if confirmGiveUp}
  <ConfirmModal
    title="Give up the mission?"
    body={solo ? 'Your run ends as failed.' : 'Your run ends as failed. The others play on.'}
    confirmLabel="Give up"
    cancelLabel="Keep playing"
    danger
    onconfirm={() => {
      confirmGiveUp = false
      send({ type: 'mission_give_up' })
    }}
    oncancel={() => (confirmGiveUp = false)}
  />
{/if}
