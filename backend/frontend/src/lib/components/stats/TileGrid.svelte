<script lang="ts">
  // A row of stat tiles: five across on wide screens, two across below with the last one taking a
  // whole row when it would sit alone.
  import type { Snippet } from 'svelte'

  let { children }: { children: Snippet } = $props()
</script>

<div class="grid grid-cols-2 gap-3 lg:grid-cols-5 max-lg:[&>:last-child:nth-child(odd)]:col-span-2">{@render children()}</div>
