<!--
  A mission's details, opened from its card (the phone card's only way in): what each step asks,
  Your best and Friends' best, and the highscores (the top 10 best runs). Play from here too.
-->
<script lang="ts">
  import LoadingBlock from '$lib/components/LoadingBlock.svelte'
  import { Play } from '@lucide/svelte'
  import { Button } from '$lib/components/ui/button/index.js'
  import { Modal } from '$lib/components/ui/modal/index.js'
  import { loadHighscores } from '$lib/missions/api'
  import {
    authorLabel,
    bests,
    bestValue,
    cardPills,
    DIFFICULTY_LABEL,
    DIFFICULTY_TONE,
    type MissionBest,
    type MissionCard,
  } from '$lib/missions/view'
  import { stepDetail, stepTitle } from '$shared/missions/describe'
  import MissionPill from './MissionPill.svelte'

  let { card, viewerId, onplay, onclose }: { card: MissionCard; viewerId: string | null; onplay: () => void; onclose: () => void } =
    $props()

  const m = $derived(card.mission)
  const best = $derived(bests(card, viewerId))
  let scores = $state<MissionBest[] | null | 'failed'>(null)
  $effect(() => {
    const id = card.id
    void loadHighscores(id).then(h => {
      if (card.id === id) scores = h ?? 'failed'
    })
  })
</script>

<Modal title={m.name} subtitle={authorLabel(card, viewerId)} {onclose} widthClass="max-w-[520px]">
  <div class="flex flex-wrap gap-1.5">
    <MissionPill label={DIFFICULTY_LABEL[m.difficulty]} tone={DIFFICULTY_TONE[m.difficulty]} />
    {#each cardPills(card) as p (p.label)}<MissionPill label={p.label} tone={p.tone} />{/each}
  </div>
  {#if m.description}<p class="text-label text-ink-2">{m.description}</p>{/if}
  <ol class="flex flex-col gap-2" aria-label="Steps">
    {#each m.steps as step, i (i)}
      <li class="flex items-start gap-2.5">
        <span
          class="mt-px flex size-6 flex-none items-center justify-center rounded-segment bg-surface-paused font-display text-label font-bold text-accent"
          >{i + 1}</span
        >
        <span class="flex min-w-0 flex-col">
          <span class="text-label font-semibold">{stepTitle(step)}</span>
          <span class="text-small text-text-muted">{stepDetail(step)}</span>
        </span>
      </li>
    {/each}
  </ol>
  <div class="grid grid-cols-2 gap-3 border-t border-surface-paused pt-3">
    <span class="flex flex-col"
      ><span class="text-caption text-text-muted">Your best</span><span class="font-display text-player-name font-bold">{best.yours}</span
      >{#if best.tried}<span class="text-caption text-text-muted">{best.tried}</span>{/if}</span
    >
    <span class="flex flex-col"
      ><span class="text-caption text-text-muted">Friends’ best</span><span class="font-display text-player-name font-bold"
        >{best.friends}</span
      ></span
    >
  </div>
  <section aria-label="Highscores" class="flex flex-col gap-1.5">
    <h3 class="label-caps text-caption font-semibold text-text-dim">Highscores</h3>
    {#if scores === null}
      <LoadingBlock rows={3} label="Loading the highscores" class="min-h-0 py-2" />
    {:else if scores === 'failed'}
      <p class="text-small text-text-muted">Couldn't load the highscores.</p>
    {:else if scores.length === 0}
      <p class="text-small text-text-muted">Nobody has completed it yet. Be the first.</p>
    {:else}
      <ol class="flex flex-col">
        {#each scores as s, i (s.userId)}
          <li class="flex h-8 items-center gap-3 text-label {s.userId === viewerId ? 'text-accent' : ''}">
            <span class="w-4 font-display font-bold">{i + 1}</span>
            <span class="min-w-0 flex-1 truncate">{s.userId === viewerId ? 'You' : s.name}</span>
            <span class="font-display text-lead font-bold">{bestValue(m.rankBy, s)}</span>
          </li>
        {/each}
      </ol>
    {/if}
  </section>
  {#snippet footer()}
    <Button variant="accent" size="lg" class="flex-1" onclick={onplay}><Play size={16} />Play</Button>
  {/snippet}
</Modal>
