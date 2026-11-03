<!--
  The live coach beside a solo X01 game (coach.live.enabled): the next dart's best aims, this visit's
  darts as the coach classes them, the last visit's grade. GameDisplay loads it lazily; it fetches
  only the model of the player's coaching level (one level above their 30-day average); `compact` (phones, tablets) folds it into one line that opens.
-->
<script lang="ts">
  import type { X01Game } from '$lib/api/game-ws'
  import { keepGrade, liveAverage, liveCoach, type LiveCoach, type LiveGrade } from '$lib/coach/live'
  import { coachedAs } from '$lib/coach/leg'
  import { LEVEL_AVERAGE } from '$shared/botLevels'
  import { coachLevel, loadModel, type CoachModel } from '$shared/coach/model'
  import { flag } from '$lib/flags'
  import { profileOf } from '$lib/progress/profiles'
  import DartTile from './DartTile.svelte'
  import GradePill from './GradePill.svelte'
  import VisitNumbers from './VisitNumbers.svelte'

  let { game, userId, compact = false }: { game: X01Game; userId: string | null; compact?: boolean } = $props()

  // The visit's numbers are for checking the model
  const debug = flag('coach.debug.enabled')
  let profileAverage = $state<number | null>(null)
  $effect(() => {
    if (!userId) return
    return profileOf(userId).subscribe(p => (profileAverage = p?.average ?? null))
  })
  const average = $derived(liveAverage(profileAverage, game.pointsScored[0] ?? 0, game.dartsThrown[0] ?? 0))
  // shortcut: level 7 until the profile arrives (and for good while progression is off), so a
  // player with an average may fetch level 7's table first; fine while it's one small chunk
  const level = $derived(coachLevel(profileAverage))
  let model = $state<CoachModel | null>(null)
  $effect(() => {
    const want = level
    void loadModel(want)
      .then(m => {
        if (want === level) model = m
      })
      .catch(() => undefined)
  })
  const live = $derived(model ? liveCoach(model, game.visitStartScores[0] ?? game.scores[0], game.currentVisitDarts, average.value) : null)
  const coached = $derived(model ? `${coachedAs(model.level)}.` : '')
  // The last finished visit's grade stays until the next visit's first dart
  let kept: LiveGrade | null = null
  const grade = $derived.by(() => (live ? (kept = keepGrade(kept, live)) : kept))
  const top = $derived(live?.aims[0] ?? null)
</script>

{#snippet body(live: LiveCoach)}
  <section class="flex flex-col gap-2" aria-labelledby="live-coach-aims">
    <div class="flex items-baseline justify-between gap-2">
      <h3 id="live-coach-aims" class="m-0 text-[13px] font-semibold uppercase tracking-[0.08em] text-text-muted">Aim now</h3>
      {#if live.aims.length}<span class="text-[12px] text-text-dim">dart {live.rows.length + 1} of 3 · {live.left} left</span>{/if}
    </div>
    {#if live.aims.length}
      <ol class="m-0 p-0 list-none flex flex-col gap-1.5">
        {#each live.aims as a, i (a.aimId)}
          <li
            class="flex items-center justify-between gap-3 px-3 py-2 rounded-[10px] border {i === 0
              ? 'border-accent/50 bg-accent/10'
              : 'border-line bg-surface-inset'}"
          >
            <span class="font-display font-bold text-[24px] leading-none {i === 0 ? 'text-accent' : ''}">{a.label}</span>
            <span class="text-[13px] text-ink-2 tabular-nums text-right">{a.detail}</span>
          </li>
        {/each}
      </ol>
      <p class="m-0 text-[12px] text-text-dim">
        {live.scoring
          ? `Points a dart for a ${LEVEL_AVERAGE[(model?.level ?? 7) - 1]}-average player.`
          : 'Chance to check out this visit or the next, and what the aim leaves.'}
      </p>
    {:else}
      <p class="m-0 text-[13px] text-text-muted">Visit done. Pull your darts.</p>
    {/if}
  </section>

  <section class="flex flex-col gap-2" aria-labelledby="live-coach-visit">
    <h3 id="live-coach-visit" class="m-0 text-[13px] font-semibold uppercase tracking-[0.08em] text-text-muted">This visit</h3>
    {#if live.rows.length}
      <ul class="m-0 p-0 list-none flex flex-col gap-2">
        {#each live.rows as r, i (i)}<li class="flex items-center gap-2"><DartTile tile={r} /></li>{/each}
      </ul>
      {#if $debug && live.visit}<VisitNumbers visit={live.visit} />{/if}
    {:else}
      <p class="m-0 text-[13px] text-text-muted">No darts yet.</p>
    {/if}
  </section>

  {#if grade}
    <section class="flex flex-col gap-2" aria-labelledby="live-coach-grade">
      <div class="flex items-center justify-between gap-2">
        <h3 id="live-coach-grade" class="m-0 text-[13px] font-semibold uppercase tracking-[0.08em] text-text-muted">
          {live.graded ? 'This visit' : 'Last visit'} · <span class="capitalize">{grade.tag}</span>
        </h3>
        <GradePill grade={grade.grade} />
      </div>
      <p class="m-0 text-[14px] leading-[1.45] {grade.tip ? 'text-ice' : ''}">
        <span class="font-display font-bold text-[16px]">{grade.darts}</span> · {grade.text}
      </p>
    </section>
  {/if}
  <p class="m-0 mt-auto text-[12px] text-text-dim">{average.line} {coached}</p>
{/snippet}

{#if !live}
  <!-- The model is loading: nothing to show yet -->
{:else if compact}
  <details class="group shrink-0 rounded-[14px] bg-surface-panel border border-line-2" aria-labelledby="live-coach-title">
    <summary class="flex items-center gap-2 px-3 py-2 cursor-pointer list-none text-[14px]">
      <h2 id="live-coach-title" class="m-0 text-[14px] font-semibold">Coach</h2>
      {#if top}
        <span class="text-text-muted">· aim <b class="font-display text-[17px] text-accent">{top.label}</b> {top.detail}</span>
      {/if}
      <span class="ml-auto flex items-center gap-2">
        {#if grade}<GradePill grade={grade.grade} />{/if}
        <span class="text-text-dim text-[12px] group-open:hidden">Show</span>
        <span class="text-text-dim text-[12px] hidden group-open:inline">Hide</span>
      </span>
    </summary>
    <!-- The match screen doesn't scroll on phones: the open coach does, so the keypad stays in view -->
    <div class="px-3 pb-3 max-h-[38dvh] overflow-y-auto flex flex-col gap-4">{@render body(live)}</div>
  </details>
{:else}
  <aside
    class="w-[340px] 2xl:w-[400px] shrink-0 min-h-0 overflow-y-auto box-border p-6 rounded-[18px] flex flex-col gap-5 bg-surface-panel border border-line-2"
    aria-labelledby="live-coach-title"
  >
    <h2 id="live-coach-title" class="m-0 font-display font-bold text-[26px] leading-none uppercase">Coach</h2>
    {@render body(live)}
  </aside>
{/if}
