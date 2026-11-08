<script lang="ts">
  // One seat's colour: a swatch button that opens a bits-ui popover with a palette (a radio group,
  // so arrow keys and screen readers work) and the browser's own colour field for any other colour.
  import { Popover } from 'bits-ui'
  import { Check } from '@lucide/svelte'
  import PopoverPanel from '$lib/components/lobby/PopoverPanel.svelte'
  import { SEAT_PALETTE, colorName } from '$lib/lights/seatColors'

  let {
    seat,
    color,
    disabled = false,
    onpick,
  }: { seat: number; color: string; disabled?: boolean; onpick: (hex: string) => void } = $props()
  let open = $state(false)

  const pick = (hex: string) => {
    onpick(hex.toLowerCase())
    open = false
  }
</script>

<Popover.Root bind:open>
  <Popover.Trigger
    {disabled}
    aria-label="Seat {seat} colour: {colorName(color)}. Change"
    class="inline-flex items-center gap-2 h-[34px] pl-[6px] pr-[10px] rounded-sm border border-line-strong bg-bg
           text-[12px] text-ink-2 cursor-pointer disabled:opacity-50 disabled:cursor-default"
  >
    <span class="size-[22px] rounded-full border border-line-strong" style="background: {color}"></span>
    <span class="font-mono">{color.toLowerCase()}</span>
  </Popover.Trigger>
  <PopoverPanel label="Colour for seat {seat}" role="dialog" width={232}>
    <div role="radiogroup" aria-label="Seat {seat} colour" class="grid grid-cols-6 gap-[6px] p-[6px]">
      {#each SEAT_PALETTE as c (c.hex)}
        {@const selected = c.hex === color.toLowerCase()}
        <button
          type="button"
          role="radio"
          aria-checked={selected}
          aria-label={c.name}
          title={c.name}
          onclick={() => pick(c.hex)}
          class="relative size-[30px] rounded-full border border-line-strong cursor-pointer grid place-items-center
                 focus-visible:outline-2 focus-visible:outline-accent {selected
            ? 'ring-2 ring-accent ring-offset-2 ring-offset-surface-inset'
            : ''}"
          style="background: {c.hex}"
        >
          {#if selected}<Check size={14} class="text-black mix-blend-difference" aria-hidden="true" />{/if}
        </button>
      {/each}
    </div>
    <label class="flex items-center justify-between gap-2 px-[8px] py-[6px] text-[12px] text-text-dim">
      Custom colour
      <input
        type="color"
        value={color.toLowerCase()}
        aria-label="Custom colour for seat {seat}"
        onchange={e => pick(e.currentTarget.value)}
        class="w-[44px] h-[28px] p-0 border border-line-strong rounded-chip bg-transparent cursor-pointer"
      />
    </label>
  </PopoverPanel>
</Popover.Root>
