<!--
  The builder's live Preview (Mission-Builder artboard): the card as players will see it (author,
  name, pills, the steps in words), To complete, and the usual time and darts.
-->
<script lang="ts">
  import { Clock, Lock } from '@lucide/svelte'
  import Avatar from '$lib/components/Avatar.svelte'
  import MissionPill from '$lib/components/missions/MissionPill.svelte'
  import { stepTitle } from '$shared/missions/describe'
  import { estimate } from '$shared/missions/estimate'
  import type { Mission } from '$shared/missions/types'
  import { toComplete } from '$lib/missions/builder'
  import { cardPills, DIFFICULTY_LABEL, DIFFICULTY_TONE } from '$lib/missions/view'

  let {
    mission,
    author,
    official,
    checked,
  }: {
    mission: Mission
    author: string
    official: boolean
    /** Each step as the checks pass it, null for one they refuse. */
    checked: (Mission['steps'][number] | null)[]
  } = $props()

  const pills = $derived(cardPills({ mission, official }))
  const complete = $derived(toComplete(mission))
  const valid = $derived(checked.filter(s => s !== null))
  const guess = $derived(valid.length > 0 ? estimate({ steps: valid, timeLimit: mission.timeLimit }) : null)
</script>

<div class="flex flex-col gap-3">
  <div class="flex flex-col gap-2 rounded-card border border-line bg-surface-1 p-4">
    <div class="flex items-center gap-2">
      <Avatar name={official ? 'Dartcade' : author} face={null} size={20} tone="accent" />
      <span class="text-small text-text-muted">by {official ? 'Dartcade' : author}</span>
    </div>
    <span class="type-wordmark leading-none tracking-normal {mission.name.trim() ? '' : 'text-text-dim'}"
      >{mission.name.trim() || 'Untitled mission'}</span
    >
    <div class="flex flex-wrap gap-1.5">
      {#each pills as p (p.label)}<MissionPill label={p.label} tone={p.tone} />{/each}
      <MissionPill label={DIFFICULTY_LABEL[mission.difficulty]} tone={DIFFICULTY_TONE[mission.difficulty]} />
    </div>
    {#each checked as step, i (i)}
      <div class="flex items-center gap-2.5 border-t border-surface-chip py-2">
        <span
          class="flex size-6 flex-none items-center justify-center rounded-segment bg-surface-chip font-display text-label font-bold text-accent"
          >{i + 1}</span
        >
        <span class="flex-1 text-label">{step ? stepTitle(step) : `Step ${i + 1}`}</span>
        {#if mission.order === 'in_order' && i > 0}<Lock size={14} class="text-text-dim" aria-label="Unlocks after step {i}" />{/if}
      </div>
    {:else}
      <p class="border-t border-surface-chip pt-2 text-small text-text-dim">No steps yet.</p>
    {/each}
  </div>
  {#if mission.steps.length > 0}
    <div class="flex flex-col gap-1.5 rounded-xl border border-surface-chip bg-surface-1 px-3.5 py-3">
      <span class="text-label font-semibold">To complete</span>
      <span class="text-label leading-normal text-ink-2"
        >{complete.time ? `${complete.lead} within ` : complete.lead}{#if complete.time}<b class="text-clock">{complete.time}</b>{/if}. {complete.tail}</span
      >
      {#if guess}
        <span class="flex items-center gap-1.5 text-small text-text-muted">
          <Clock size={14} />Usually takes {guess.minMinutes === guess.maxMinutes
            ? guess.minMinutes
            : `${guess.minMinutes}–${guess.maxMinutes}`} min · about {guess.darts} darts
        </span>
      {/if}
    </div>
  {/if}
</div>
