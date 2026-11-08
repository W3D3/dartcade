<script lang="ts">
  // A small uppercase caption above a group: a settings heading, a list label, a stat name.
  import type { Snippet } from 'svelte'

  let { as = 'span', id, children }: { as?: 'span' | 'h2' | 'h3' | 'dt'; id?: string; children: Snippet } = $props()
</script>

<svelte:element this={as} {id} class="text-[12px] font-semibold label-caps text-text-dim">{@render children()}</svelte:element>
