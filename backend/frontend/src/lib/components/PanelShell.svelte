<script lang="ts">
  // Frame of a player panel (1–2 players): avatar, name, optional aside (leg pips), pill.
  import type { Snippet } from 'svelte'
  import PlayerPill from './PlayerPill.svelte'
  import type { PillKind } from './pills.js'

  let { name, active, solo = false, pill, pillInRow = false, aside, children }: {
    name: string
    active: boolean
    solo?: boolean
    pill: PillKind | null
    /** Put the pill at the end of the name row (ATC and solo) instead of under it. */
    pillInRow?: boolean
    aside?: Snippet
    children: Snippet
  } = $props()

  const initial = $derived(name.trim().charAt(0).toUpperCase() || '?')
</script>

<section aria-label="{name}, {active ? 'throwing' : 'waiting'}"
  class="{solo ? 'w-[400px] shrink-0 p-6 gap-[18px]' : 'flex-1 p-7 gap-[14px]'} min-w-0 min-h-0 box-border rounded-[18px] flex flex-col overflow-hidden
         {active ? 'bg-surface-active border-2 border-accent' : 'bg-surface-panel border border-line-2'}">
  <div class="flex items-center gap-3 min-w-0">
    <span class="w-10 h-10 shrink-0 rounded-full flex items-center justify-center font-bold text-[17px]
                 {active ? 'bg-accent text-accent-fg' : 'bg-line-chip text-text'}">{initial}</span>
    <span class="text-[22px] font-semibold truncate {active ? 'text-text' : 'text-ink-2'}">{name}</span>
    <span class="ml-auto flex items-center gap-3 shrink-0">
      {@render aside?.()}
      {#if pill && pillInRow}<PlayerPill kind={pill} />{/if}
    </span>
  </div>
  {#if pill && !pillInRow}<PlayerPill kind={pill} />{/if}
  {@render children()}
</section>
