<script lang="ts">
  // A button that opens a small menu below it; picking an item or clicking outside closes it.
  import type { Snippet } from 'svelte'
  import MenuPanel from './MenuPanel.svelte'

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

  let open = $state(false)
  let triggerButton: HTMLButtonElement | undefined = $state()

  const close = () => { open = false }

  const handleKeydown = (e: KeyboardEvent) => {
    if (open && e.key === 'Escape') {
      close()
      triggerButton?.focus()
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<span class="relative inline-block min-w-0 max-w-full">
  <button bind:this={triggerButton} type="button" onclick={() => open = !open} aria-haspopup="menu" aria-expanded={open} aria-label={triggerLabel}
    class="cursor-pointer font-[inherit] {triggerClass}">
    {@render trigger(open)}
  </button>
  {#if open}
    <div class="fixed inset-0 z-[5]" onclick={close} aria-hidden="true"></div>
    <MenuPanel {label} {align} {width}>{@render children(close)}</MenuPanel>
  {/if}
</span>
