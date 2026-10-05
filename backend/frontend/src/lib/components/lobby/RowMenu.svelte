<script lang="ts">
  // The ⋯ on a person's row: move up or down (the host), remove (the host; members for their guests).
  import { Ellipsis } from '@lucide/svelte'
  import MenuItem from './MenuItem.svelte'
  import PopoverMenu from './PopoverMenu.svelte'

  let {
    name,
    onup,
    ondown,
    onremove,
  }: {
    name: string
    /** Absent: that's not possible (first or last, not the host, not yours). */
    onup?: () => void
    ondown?: () => void
    onremove?: () => void
  } = $props()
</script>

{#if onup || ondown || onremove}
  <PopoverMenu
    label="More for {name}"
    triggerLabel="More for {name}"
    align="right"
    width={200}
    triggerClass="w-9 h-11 md:h-9 flex items-center justify-center bg-transparent border-0 md:border md:border-solid md:border-line-chip rounded-[8px] text-text-muted"
  >
    {#snippet trigger()}<Ellipsis size={18} />{/snippet}
    {#snippet children(close: () => void)}
      {#if onup}{@const f = onup}<MenuItem
          label="Move up"
          onclick={() => {
            close()
            f()
          }}
        />{/if}
      {#if ondown}{@const f = ondown}<MenuItem
          label="Move down"
          onclick={() => {
            close()
            f()
          }}
        />{/if}
      {#if onremove}{@const f = onremove}<MenuItem
          label="Remove from lobby"
          danger
          onclick={() => {
            close()
            f()
          }}
        />{/if}
    {/snippet}
  </PopoverMenu>
{/if}
