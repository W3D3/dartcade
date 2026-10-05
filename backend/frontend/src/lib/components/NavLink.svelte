<script lang="ts">
  // A link in the desktop side nav; the current page is highlighted.
  import type { Snippet } from 'svelte'

  let { href, active, children }: { href: string; active: boolean; children: Snippet } = $props()
</script>

<a
  {href}
  aria-current={active ? 'page' : undefined}
  class="flex items-center gap-3 h-11 px-3 rounded-lg no-underline text-[15px] transition-colors
         {active ? 'bg-surface-paused text-text font-semibold' : 'text-ink-2 font-medium'}"
>
  {@render children()}
</a>
