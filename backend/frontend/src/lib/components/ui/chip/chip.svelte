<script lang="ts">
  import type { Snippet } from 'svelte'

  // `plain`: the neutral filter chip (the Coach pages); `href` makes it a link, `aria-current` when selected
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
    variant?: 'accent' | 'plain'
    children: Snippet
  } = $props()

  const cls = $derived(
    variant === 'plain'
      ? `inline-flex h-8 flex-none items-center gap-1.5 whitespace-nowrap rounded-full border px-3 font-[inherit] text-[13px] no-underline cursor-pointer hover:text-text ${
          selected ? 'border-line-popover bg-surface-paused font-semibold text-text' : 'border-line-2 bg-transparent text-ink-2'
        }`
      : `px-3 py-1 rounded-full text-[13px] border transition-colors ${
          selected ? 'border-accent text-accent bg-accent/10' : 'border-line-2 text-text-muted hover:border-line-3'
        }`,
  )
</script>

{#if href}
  <a {href} aria-current={selected ? 'true' : undefined} class={cls}>{@render children()}</a>
{:else}
  <button type="button" {onclick} aria-pressed={selected} class={cls}>{@render children()}</button>
{/if}
