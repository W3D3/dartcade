<script lang="ts">
  // One option on the Customise page (Profile-Customise boards): its preview and name. The one in
  // your draft has the accent border and a tick; a locked one is greyed, with a lock badge and what
  // unlocks it, and can't be picked. `row`: the preview and name side by side (titles).
  import type { Snippet } from 'svelte'
  import { Check, Lock } from '@lucide/svelte'

  let {
    name,
    open,
    selected,
    unlock,
    row = false,
    wide = false,
    onpick,
    children,
  }: {
    name: string
    open: boolean
    selected: boolean
    /** What unlocks it, shown while locked ('Level 25'). */
    unlock: string
    row?: boolean
    /** The preview fills the tile's width (banners, colours); otherwise it's centred at its own size. */
    wide?: boolean
    onpick: () => void
    children: Snippet
  } = $props()
</script>

<button
  type="button"
  aria-pressed={selected}
  aria-disabled={!open}
  aria-label={open ? name : `${name}, locked: ${unlock}`}
  title={open ? name : `${name} · ${unlock}`}
  onclick={() => open && onpick()}
  class="relative w-full h-full min-w-0 box-border flex rounded-[12px] border font-[inherit] text-text text-center
         {row
    ? 'flex-row items-center justify-between gap-2 px-3 py-[10px] text-left'
    : 'flex-col items-center gap-[6px] px-2 pt-[10px] pb-2'}
         {!open
    ? 'cursor-default border-surface-inset bg-[#111310]'
    : selected
      ? 'cursor-pointer border-accent bg-surface-picked shadow-[0_0_0_1px_var(--color-accent)]'
      : 'cursor-pointer border-line-2 bg-surface-1 hover:border-line-chip hover:bg-surface-2'}"
>
  <span class="relative flex max-w-full min-w-0 {wide ? 'w-full' : ''}">
    <span class="flex max-w-full min-w-0 {wide ? 'w-full' : ''} {open ? '' : 'grayscale brightness-[.6]'}">
      {@render children()}
    </span>
    {#if !open && !row}
      <span
        class="absolute right-0 bottom-0 size-[22px] rounded-full bg-surface-paused border-2 border-[#111310] flex items-center justify-center text-text-muted"
        aria-hidden="true"><Lock size={11} /></span
      >
    {/if}
  </span>
  {#if row}
    <span class="ml-auto shrink-0 inline-flex items-center gap-[6px] text-[11px] text-text-dim"
      >{unlock}{#if !open}<Lock size={11} aria-hidden="true" />{/if}</span
    >
    {#if selected}
      <span class="size-[18px] shrink-0 rounded-full bg-accent text-accent-fg flex items-center justify-center" aria-hidden="true"
        ><Check size={12} strokeWidth={3} /></span
      >
    {/if}
  {:else}
    <span class="max-w-full truncate text-[12px] font-semibold {open ? 'text-text' : 'text-text-muted'}">{name}</span>
    {#if !open}<span class="text-[10.5px] leading-tight text-text-dim">{unlock}</span>{/if}
    {#if selected}
      <span
        class="absolute top-[6px] right-[6px] size-[18px] rounded-full bg-accent text-accent-fg flex items-center justify-center"
        aria-hidden="true"><Check size={12} strokeWidth={3} /></span
      >
    {/if}
  {/if}
</button>
