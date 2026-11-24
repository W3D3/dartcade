<script lang="ts">
  // The chosen users or countries of a filter, each with an Include / Exclude switch and a remove button.
  import { X } from '@lucide/svelte'
  import SegmentedControl from '$lib/components/SegmentedControl.svelte'
  import type { Choice, Side } from '$lib/admin/activityGames'

  let {
    picks,
    onchange,
    name,
    label,
  }: {
    picks: Choice[]
    onchange: (picks: Choice[]) => void
    /** What a pick is called ("Anna", "Austria"). */
    name: (id: string) => string
    /** What the list is ("users") for the buttons' names. */
    label: string
  } = $props()

  const SIDES: { value: Side; label: string }[] = [
    { value: 'in', label: 'Include' },
    { value: 'out', label: 'Exclude' },
  ]
  const setSide = (id: string, side: Side) => onchange(picks.map(p => (p.id === id ? { ...p, side } : p)))
</script>

{#if picks.length > 0}
  <ul class="flex flex-col gap-1.5" aria-label="Chosen {label}">
    {#each picks as p (p.id)}
      <li class="flex items-center gap-2 rounded-md border border-line-2 px-2 py-1">
        <span class="min-w-0 flex-1 truncate text-label">{name(p.id)}</span>
        <SegmentedControl
          label="{name(p.id)}: include or exclude"
          options={SIDES}
          value={p.side}
          onchange={(side: Side) => setSide(p.id, side)}
          class="w-44"
        />
        <button
          type="button"
          class="flex size-8 items-center justify-center text-text-muted hover:text-text"
          aria-label="Remove {name(p.id)}"
          onclick={() => onchange(picks.filter(x => x.id !== p.id))}><X size={16} /></button
        >
      </li>
    {/each}
  </ul>
{/if}
