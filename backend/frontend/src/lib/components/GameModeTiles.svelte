<script lang="ts">
  // The game mode tiles (Play page, the lobby's Change game dialog): pick one; the ones that
  // are coming soon can't be picked.
  import { Check } from '@lucide/svelte'
  import { GAME_MODES } from '$lib/gameModes'

  let {
    selected,
    onselect,
    disabled = false,
    compact = false,
  }: {
    selected: string | null
    onselect?: (id: string) => void
    /** Shown, not picked: the selected tile stays marked. */
    disabled?: boolean
    /** Phone-sized tiles at every width (in a dialog). */
    compact?: boolean
  } = $props()

  // The big screen's sizes come on top of the phone's, unless compact: compact cards on
  // tablets (md up to xl), the large tiles on desktops
  const md = (cls: string) => (compact ? '' : cls)
</script>

<div class="grid grid-cols-2 gap-[10px] {md('md:flex-grow md:grid-rows-2 md:gap-3 xl:gap-4')}">
  {#each GAME_MODES as mode (mode.id)}
    {@const active = mode.id === selected}
    {@const unavailable = !mode.available}
    <button
      type="button"
      onclick={() => {
        if (mode.available && !disabled) onselect?.(mode.id)
      }}
      disabled={unavailable || disabled}
      class="relative text-left box-border h-[92px] px-[14px] py-3 rounded-[12px] {md(
        'md:h-auto md:p-[18px] md:gap-[6px] md:rounded-[14px] xl:p-6 xl:gap-[10px]',
      )} flex flex-col gap-[10px]
             overflow-hidden transition-colors font-[inherit]
             {unavailable
        ? 'bg-surface-2 border border-line-2 opacity-40 cursor-not-allowed'
        : active
          ? `bg-surface-active border-2 border-accent ${disabled ? 'cursor-default' : 'cursor-pointer'}`
          : `bg-surface-2 border border-line-2 ${disabled ? 'cursor-default' : 'cursor-pointer'}`}"
    >
      {#if active && !unavailable}
        <span
          class="absolute top-2 right-2 w-6 h-6 {md(
            'md:top-4 md:right-4 md:w-[26px] md:h-[26px] xl:top-[18px] xl:right-[18px] xl:w-7 xl:h-7',
          )} rounded-full bg-accent
                     flex items-center justify-center"
        >
          <Check size={16} strokeWidth={3} />
        </span>
      {/if}
      {#if unavailable}
        <span
          class="absolute top-[14px] right-[14px] text-[11px] font-medium tracking-[0.06em]
                     uppercase text-text-dim border border-line-3 rounded-[5px] px-[7px] py-[3px]"
        >
          Soon
        </span>
      {/if}
      <span
        class="font-display font-bold text-[34px] {md('md:text-[56px] xl:text-[88px]')} leading-[0.9]
                   {active && !unavailable ? 'text-accent' : 'text-transparent [-webkit-text-stroke:1.5px_#5a5e53]'}"
      >
        {mode.glyph}
      </span>
      <span class="mt-auto font-display font-bold text-[18px] {md('md:text-[22px] xl:text-[30px]')} uppercase tracking-[0.02em] text-text">
        {mode.name}
      </span>
      {#if !compact}
        <span
          class="hidden md:block text-[13px] leading-[1.4] xl:text-[15px] xl:leading-[1.45] {active && !unavailable
            ? 'text-[#b4b5aa]'
            : 'text-text-muted'}"
        >
          {mode.desc}
        </span>
      {/if}
    </button>
  {/each}
</div>
