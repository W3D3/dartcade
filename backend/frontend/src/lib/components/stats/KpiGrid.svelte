<script lang="ts">
  // A section's five numbers: five across on wide screens, two across below with the last one
  // taking the whole row.
  import type { Snippet } from 'svelte'

  let { children }: { children: Snippet } = $props()
</script>

<div class="grid grid-cols-2 gap-3 lg:grid-cols-5 max-lg:[&>:last-child]:col-span-2">{@render children()}</div>
