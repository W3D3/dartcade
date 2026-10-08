<script lang="ts">
  // A button that opens floating content next to it: a menu (PopoverMenu) or other content
  // (the lobby QR code). Built on bits-ui's Popover: an outside click or Escape closes it and
  // returns focus to the button.
  import type { Snippet } from 'svelte'
  import { Popover } from 'bits-ui'

  let {
    triggerLabel,
    triggerClass = '',
    haspopup = 'menu',
    trigger,
    panel,
    onopen,
  }: {
    /** The trigger button's accessible name. */
    triggerLabel?: string
    triggerClass?: string
    haspopup?: 'menu' | 'dialog'
    /** The trigger's content; told whether the popover is open. */
    trigger: Snippet<[boolean]>
    /** The floating content (a PopoverPanel); given `close` to call after use. */
    panel: Snippet<[() => void]>
    /** Called each time it opens. */
    onopen?: () => void
  } = $props()

  let open = $state(false)

  const close = () => {
    open = false
  }
</script>

<Popover.Root
  bind:open
  onOpenChange={o => {
    if (o) onopen?.()
  }}
>
  <Popover.Trigger aria-haspopup={haspopup} aria-label={triggerLabel} class="cursor-pointer font-[inherit] {triggerClass}">
    {@render trigger(open)}
  </Popover.Trigger>
  {@render panel(close)}
</Popover.Root>
