<script lang="ts">
  import type { Snippet } from 'svelte'
  import { chipVariants, type ChipVariant } from './chip-variants.js'

  // `href` makes it a link, `aria-current` when selected
  let {
    selected = false,
    onclick,
    href,
    variant = 'accent',
    children,
  }: {
    selected?: boolean
    onclick?: () => void
    href?: string
    variant?: ChipVariant
    children: Snippet
  } = $props()

  const cls = $derived(chipVariants({ variant, selected }))
</script>

{#if href}
  <a {href} aria-current={selected ? 'true' : undefined} class={cls}>{@render children()}</a>
{:else}
  <button type="button" {onclick} aria-pressed={selected} class={cls}>{@render children()}</button>
{/if}
