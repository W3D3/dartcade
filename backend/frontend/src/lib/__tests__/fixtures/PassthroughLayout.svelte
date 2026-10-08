<script lang="ts">
  // Stands in for $lib/components/Layout.svelte in tests that don't need the real nav chain
  // (SideNav/NavRail/.../svelte-spa-router) — see routeLoadFailed.test.ts.
  import type { Snippet } from 'svelte'

  let { children }: { children: Snippet } = $props()
</script>

{@render children()}
