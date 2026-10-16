<script lang="ts">
  // The lobby's Change game dialog picks from these compact tiles: the playable modes only, and
  // ones behind a feature flag that's off aren't shown. The Play page has its own cards (GameCards).
  import { Check } from '@lucide/svelte'
  import { shownModes } from '$lib/gameModes'

  let {
    selected,
    onselect,
  }: {
    selected: string | null
    onselect?: (id: string) => void
  } = $props()

  const modes = $derived($shownModes.filter(m => m.available))
</script>

<div class="grid grid-cols-2 gap-[10px]">
  {#each modes as mode (mode.id)}
    {@const active = mode.id === selected}
    <button
      type="button"
      onclick={() => onselect?.(mode.id)}
      class="relative text-left box-border h-[92px] px-[14px] py-3 rounded-[12px] flex flex-col gap-[10px]
             overflow-hidden transition-colors font-[inherit] cursor-pointer
             {active ? 'bg-surface-active border-2 border-accent' : 'bg-surface-2 border border-line-2'}"
    >
      {#if active}
        <span class="absolute top-2 right-2 w-6 h-6 rounded-full bg-accent flex items-center justify-center">
          <Check size={16} strokeWidth={3} />
        </span>
      {/if}
      <span
        class="font-display font-bold text-[34px] leading-[0.9] {active
          ? 'text-accent'
          : 'text-transparent [-webkit-text-stroke:1.5px_#5a5e53]'}"
      >
        {mode.glyph}
      </span>
      <span class="mt-auto font-display font-bold text-[18px] uppercase tracking-[0.02em] text-text">
        {mode.name}
      </span>
    </button>
  {/each}
</div>
