<!--
  A finished mission (in place of the win screen, as 121's summary): the viewer's outcome (completed,
  time ran out, gave up), steps done, time and darts, a new personal best or highscore, the XP it paid,
  each step's time, and with more players their places. Play again and Back to missions.
-->
<script lang="ts">
  import { Check, X } from '@lucide/svelte'
  import type { MissionGame } from '$lib/api/game-ws'
  import { push } from 'svelte-spa-router'
  import ErrorText from '$lib/components/ErrorText.svelte'
  import { Button } from '$lib/components/ui/button/index.js'
  import { me } from '$lib/lobby/sockets'
  import { startMission } from '$lib/missions/api'
  import { hrefs } from '$lib/routes'
  import GameXpChip from '$lib/components/progress/GameXpChip.svelte'
  import { ordinal, plural } from '$lib/fmt'
  import type { Who } from '$lib/face'
  import { stepTitle } from '$shared/missions/describe'
  import { fmtClock, highscoreRank, personalBest, resultRows } from '$lib/missions/view'

  type Action = { label: string; onclick: () => void }
  let {
    game,
    who,
    seat,
    own,
    viewerId,
    xpSessionId = null,
    next,
    fallback,
  }: {
    game: MissionGame
    who: Who[]
    /** Whose run the screen is about: the viewer's seat, else the winner's. */
    seat: number
    /** It is the viewer's run: a new personal best counts. */
    own: boolean
    viewerId: string | null
    /** The viewer's game: the XP it paid. */
    xpSessionId?: string | null
    /** The achievements' Next: in place of every other button while there are unlocks to show. */
    next: Action | null
    /** Where a viewer who can't play it again goes: the lobby or Play. */
    fallback: Action
  } = $props()

  // Play again: alone, or for the lobby the viewer hosts; a test run (the builder's) and a guest in
  // someone else's lobby go back instead
  const lobbyId = $derived(game.runs.length > 1 ? ($me?.lobby?.youHost ? $me.lobby.id : undefined) : null)
  let error = $state('')
  async function playAgain(lobby: string | null): Promise<void> {
    error = ''
    const res = await startMission(game.missionId, lobby)
    if ('ok' in res) void push(`/session/${res.ok}`)
    else error = res.error
  }
  const primary = $derived<Action>(
    next ?? (game.test || lobbyId === undefined ? fallback : { label: 'Play again', onclick: () => void playAgain(lobbyId) }),
  )
  const secondary = $derived<Action | null>(
    next ? null : { label: 'Back to missions', onclick: () => void push(hrefs.missions().slice(1)) },
  )

  const run = $derived(game.runs[seat])
  const n = $derived(game.mission.steps.length)
  const done = $derived(run.steps.filter(s => s.doneAt !== null).length)
  const headline = $derived(
    run.status === 'completed'
      ? 'Mission complete'
      : run.failure === 'time'
        ? 'Time ran out'
        : run.failure === 'gave_up'
          ? 'Gave up'
          : 'Mission over',
  )
  const time = $derived(fmtClock(run.timeMs ?? 0))
  const newBest = $derived(own && viewerId !== null && personalBest(game, run, viewerId))
  const rank = $derived(highscoreRank(game, run))
  const rows = $derived(
    resultRows(
      game,
      who.map(w => w.name),
    ),
  )
  const tile = 'flex flex-col gap-1 rounded-card border border-line bg-surface-1 px-5 py-4'
</script>

<main class="box-border flex min-h-0 grow flex-col gap-[18px] overflow-y-auto p-4 md:p-7" aria-label="Mission result">
  <header class="flex flex-col gap-1.5">
    <span class="text-caption font-semibold label-caps text-text-dim">{game.mission.name}{game.test ? ' · test run' : ''}</span>
    <h1 class="type-page-title font-bold leading-none md:text-glyph {run.status === 'completed' ? 'text-accent' : 'text-text'}">
      {headline}
    </h1>
    <div class="flex flex-wrap gap-2">
      {#if newBest}<span class="rounded-full bg-accent px-2.5 py-1 text-caption font-bold uppercase tracking-wide text-accent-fg"
          >New personal best</span
        >{/if}
      {#if rank !== null && rank <= 10}<span
          class="rounded-full border border-accent px-2.5 py-1 text-caption font-bold uppercase tracking-wide text-accent"
          >{rank === 1 ? 'New highscore · 1st' : `Highscores · ${ordinal(rank)}`}</span
        >{/if}
    </div>
  </header>

  <div class="grid grid-cols-2 gap-3 md:grid-cols-4">
    <div class={tile}>
      <span class="text-caption text-text-muted">Steps</span><span class="type-checkout font-bold leading-none">{done}/{n}</span>
    </div>
    <div class={tile}>
      <span class="text-caption text-text-muted">Time</span><span class="type-checkout font-bold leading-none">{time}</span>
    </div>
    <div class={tile}>
      <span class="text-caption text-text-muted">Darts</span><span class="type-checkout font-bold leading-none">{run.darts}</span>
    </div>
    {#if game.runs.length > 1 && run.place !== null}
      <div class={tile}>
        <span class="text-caption text-text-muted">Place</span><span class="type-checkout font-bold leading-none">{ordinal(run.place)}</span
        >
      </div>
    {/if}
  </div>

  {#if xpSessionId}<div class="w-full max-w-[460px]"><GameXpChip sessionId={xpSessionId} /></div>{/if}

  <section aria-label="Steps" class="flex flex-col gap-2 rounded-panel border border-line bg-surface-panel p-5">
    <h2 class="text-caption font-semibold label-caps text-text-dim">Steps</h2>
    <ol class="flex flex-col gap-2">
      {#each game.mission.steps as step, i (i)}
        {@const s = run.steps[i]}
        <li class="flex items-center gap-2.5">
          <span
            class="flex size-7 flex-none items-center justify-center rounded-lg {s.doneAt !== null
              ? 'bg-accent text-accent-fg'
              : 'bg-surface-paused text-text-dim'}"
            >{#if s.doneAt !== null}<Check size={15} strokeWidth={3} aria-label="Done" />{:else}<X
                size={15}
                aria-label="Not done"
              />{/if}</span
          >
          <span class="min-w-0 flex-1 truncate text-label font-semibold">{stepTitle(step)}</span>
          <span class="shrink-0 text-small text-text-muted"
            >{s.doneAt !== null ? `${plural(s.darts, 'dart')} · ${fmtClock(s.doneAt)}` : plural(s.attempts, 'attempt')}</span
          >
        </li>
      {/each}
    </ol>
  </section>

  {#if rows.length > 1}
    <section aria-label="Players" class="flex flex-col gap-2 rounded-panel border border-line bg-surface-panel p-5">
      <h2 class="text-caption font-semibold label-caps text-text-dim">Players</h2>
      <ol class="flex flex-col">
        {#each rows as r (r.seat)}
          <li
            class="grid h-10 grid-cols-[28px_minmax(0,1fr)_auto_auto] items-center gap-3 text-label {r.seat === seat ? 'text-accent' : ''}"
          >
            <span class="font-display text-lead font-bold">{r.place ?? '–'}</span>
            <span class="min-w-0 truncate">{r.name} <span class="text-text-muted">· {r.outcome}</span></span>
            <span class="text-text-muted">{r.steps} steps</span>
            <span class="font-display text-lead font-bold tabular-nums">{r.time}</span>
          </li>
        {/each}
      </ol>
    </section>
  {/if}

  {#if error}<ErrorText>{error}</ErrorText>{/if}
  <div class="mt-auto flex flex-col gap-3 md:flex-row">
    {#if secondary}
      <Button variant="outline" size="xl" class="flex-1 border-line-strong text-body-lg font-semibold" onclick={secondary.onclick}
        >{secondary.label}</Button
      >
    {/if}
    <Button size="xl" class="flex-[1.4]" onclick={primary.onclick}>{primary.label}</Button>
  </div>
</main>
