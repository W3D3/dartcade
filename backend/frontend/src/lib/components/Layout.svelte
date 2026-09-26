<script lang="ts">
  import type { Snippet } from 'svelte'
  import SideNav from './SideNav.svelte'
  import SessionBanner from './SessionBanner.svelte'

  let { children }: { children: Snippet } = $props()
</script>

<div class="flex h-screen bg-bg text-text overflow-hidden">
  <SideNav />
  <div class="flex flex-col flex-grow min-w-0 overflow-hidden">
    <SessionBanner />
    {@render children()}
  </div>
</div>
