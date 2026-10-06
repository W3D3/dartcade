<script lang="ts">
  // A link in the desktop side nav; the current page is highlighted. `disabled`: not a page yet
  // (e.g. Tournaments) — a span, not a link, so it doesn't go anywhere.
  import type { Snippet } from 'svelte'

  let { href, active, disabled = false, children }: { href: string; active: boolean; disabled?: boolean; children: Snippet } = $props()
</script>

{#if disabled}
  <span class="flex items-center gap-3 h-11 px-3 rounded-lg text-[15px] font-medium text-text-dim cursor-default">
    {@render children()}
  </span>
{:else}
  <a
    {href}
    aria-current={active ? 'page' : undefined}
    class="flex items-center gap-3 h-11 px-3 rounded-lg no-underline text-[15px] transition-colors
           {active ? 'bg-surface-paused text-text font-semibold' : 'text-ink-2 font-medium'}"
  >
    {@render children()}
  </a>
{/if}
