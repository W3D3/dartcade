<script lang="ts">
  // A button that opens floating content below it: a menu (PopoverMenu) or other content
  // (the lobby QR code). An outside click or Escape closes it and returns focus to the button.
  import type { Snippet } from 'svelte'

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
    /** The floating content; given `close` to call after use. */
    panel: Snippet<[() => void]>
    /** Called each time it opens. */
    onopen?: () => void
  } = $props()

  let open = $state(false)
  let triggerButton: HTMLButtonElement | undefined = $state()

  const close = () => {
    open = false
  }

  const handleKeydown = (e: KeyboardEvent) => {
    if (open && e.key === 'Escape') {
      close()
      triggerButton?.focus()
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<span class="relative inline-block min-w-0 max-w-full">
  <button
    bind:this={triggerButton}
    type="button"
    onclick={() => {
      open = !open
      if (open) onopen?.()
    }}
    aria-haspopup={haspopup}
    aria-expanded={open}
    aria-label={triggerLabel}
    class="cursor-pointer font-[inherit] {triggerClass}"
  >
    {@render trigger(open)}
  </button>
  {#if open}
    <div class="fixed inset-0 z-[5]" onclick={close} aria-hidden="true"></div>
    {@render panel(close)}
  {/if}
</span>
