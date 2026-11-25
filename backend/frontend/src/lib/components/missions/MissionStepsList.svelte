<!--
  A run's steps (Mission-Play's progress panel): done (a tick, its darts and time), the one being
  played (outlined), failed (the run ended on it), started or not started, with Switch on the others
  while the player may switch (any order, between visits).
-->
<script lang="ts">
  import { Check, X } from '@lucide/svelte'
  import type { MissionGame } from '$lib/api/game-ws'
  import { stepState, stepStatusLine } from '$lib/missions/view'
  import { stepTitle } from '$shared/missions/describe'

  let { game, seat, canSwitch, onswitch }: { game: MissionGame; seat: number; canSwitch: boolean; onswitch: (step: number) => void } =
    $props()

  const run = $derived(game.runs[seat])
  const anyOrder = $derived(game.mission.order === 'any')
  const LOOK = {
    done: 'border border-checkout-line bg-checkout-to',
    active: 'border-2 border-accent bg-card-active',
    failed: 'border-2 border-live bg-live-soft',
    started: 'border border-line bg-surface-1',
    idle: 'border border-line bg-surface-1',
  } as const
</script>

<ol class="flex flex-col gap-2" aria-label="Steps">
  {#each game.mission.steps as step, i (i)}
    {@const state = stepState(run, i)}
    <li class="flex items-center gap-2.5 rounded-xl px-3 py-2 {LOOK[state]}" aria-current={state === 'active' ? 'step' : undefined}>
      <span
        class="flex size-7 flex-none items-center justify-center rounded-lg font-display text-body-lg font-bold
          {state === 'done' ? 'bg-accent text-accent-fg' : state === 'failed' ? 'bg-live text-white' : 'bg-surface-paused text-accent'}"
      >
        {#if state === 'done'}<Check size={15} strokeWidth={3} aria-label="Done" />{:else if state === 'failed'}<X
            size={15}
            strokeWidth={3}
            aria-label="Failed"
          />{:else}{i + 1}{/if}
      </span>
      <span class="flex min-w-0 flex-1 flex-col">
        <span class="truncate text-label font-semibold {state === 'idle' ? 'text-ink-2' : 'text-text'}">{stepTitle(step)}</span>
        <span class="truncate text-caption text-text-muted">{stepStatusLine(step, run, i, anyOrder)}</span>
      </span>
      {#if canSwitch && (state === 'idle' || state === 'started')}
        <button
          type="button"
          class="h-8 shrink-0 cursor-pointer rounded-key border border-line-strong px-3 text-small font-semibold text-text hover:bg-surface-hover"
          aria-label="Switch to step {i + 1}"
          onclick={() => onswitch(i)}>Switch</button
        >
      {/if}
    </li>
  {/each}
</ol>
