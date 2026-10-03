<script lang="ts">
  // A button that opens a small menu below it; picking an item or clicking outside closes it.
  // Built on Popover, the shared open/close/focus-return behaviour (also used by the lobby QR
  // code popover).
  import type { Snippet } from 'svelte'
  import Popover from './Popover.svelte'
  import PopoverPanel from './PopoverPanel.svelte'

  let { label, triggerLabel, triggerClass = '', align = 'left', width = 250, trigger, children }: {
    /** The menu's accessible name. */
    label: string
    /** The trigger button's accessible name. */
    triggerLabel?: string
    triggerClass?: string
    align?: 'left' | 'right'
    width?: number
    /** The trigger's content; told whether the menu is open. */
    trigger: Snippet<[boolean]>
    /** The items; given `close` to call after a pick. */
    children: Snippet<[() => void]>
  } = $props()
</script>

<Popover {triggerLabel} {triggerClass} {trigger}>
  {#snippet panel(close: () => void)}
    <PopoverPanel {label} {align} {width}>{@render children(close)}</PopoverPanel>
  {/snippet}
</Popover>
