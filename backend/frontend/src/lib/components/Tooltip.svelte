<script lang="ts">
  import { Popover } from 'bits-ui'
  import type { Snippet } from 'svelte'
  // The help bubble: tap, click or Enter opens it, Escape, an outside tap or a scroll closes it. By
  // default a small "?" button; pass `trigger` to make your own text the button. The body is `text`,
  // or one paragraph per entry of `lines` (the first one bold).
  let {
    text,
    lines,
    trigger,
    label = 'Help',
    class: className = '',
  }: { text?: string; lines?: string[]; trigger?: Snippet; label?: string; class?: string } = $props()
  let open = $state(false)
</script>

<svelte:window onscrollcapture={() => (open = false)} />

<Popover.Root bind:open>
  <Popover.Trigger
    type="button"
    aria-label={label}
    class={trigger
      ? className
      : `size-[18px]  rounded-full border border-line-3 inline-flex items-center justify-center
         text-[11px] font-bold text-text-dim bg-transparent cursor-help leading-none ${className}`}
  >
    {#if trigger}{@render trigger()}{:else}?{/if}
  </Popover.Trigger>
  <Popover.Portal>
    <Popover.Content
      side="top"
      sideOffset={8}
      collisionPadding={8}
      class="z-60 w-[220px] px-3 py-2 rounded-sm text-[13px] leading-[1.45] text-text
             bg-[#1e211b] border border-line-3 shadow-tooltip whitespace-normal"
    >
      {#if lines}
        {#each lines as line, i (i)}
          <p class="m-0 {i ? 'mt-2' : 'font-semibold'}">{line}</p>
        {/each}
      {:else}
        {text}
      {/if}
    </Popover.Content>
  </Popover.Portal>
</Popover.Root>
