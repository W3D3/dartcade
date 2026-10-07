<script lang="ts">
  // An item in a PopoverMenu: an action, or a choice (with `checked`) like a board.
  import type { Snippet } from 'svelte'
  import { Check } from '@lucide/svelte'

  let {
    label,
    detail,
    checked,
    danger = false,
    leading,
    onclick,
  }: {
    label: string
    detail?: string
    /** Set for a choice: whether it's the current one. */
    checked?: boolean
    danger?: boolean
    /** Shown before the label, e.g. an avatar preview. */
    leading?: Snippet
    onclick: () => void
  } = $props()
</script>

<button
  type="button"
  role={checked === undefined ? 'menuitem' : 'menuitemradio'}
  aria-checked={checked}
  {onclick}
  class="min-h-11 flex items-center gap-[10px] px-[10px] border-0 rounded-[8px] text-left cursor-pointer font-[inherit]
         {checked ? 'bg-accent-tint' : 'bg-transparent hover:bg-surface-hover'} {danger ? 'text-live-text' : 'text-text'}"
>
  {@render leading?.()}
  <span class="flex flex-col gap-px flex-grow">
    <span class="text-[14px] md:text-[15px] {detail ? 'font-semibold' : ''}">{label}</span>
    {#if detail}<span class="text-[12px] text-text-muted">{detail}</span>{/if}
  </span>
  {#if checked}<Check size={16} class="text-accent" />{/if}
</button>
