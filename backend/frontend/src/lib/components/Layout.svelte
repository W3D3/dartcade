<script lang="ts">
  import type { Snippet } from 'svelte'
  import SideNav from './SideNav.svelte'
  import SessionBanner from './SessionBanner.svelte'
  import PhoneHeader from './PhoneHeader.svelte'
  import LobbyStrip from './LobbyStrip.svelte'
  import TabBar from './TabBar.svelte'

  let { title, headerAction, children }: { title?: string; headerAction?: Snippet; children: Snippet } = $props()
</script>

<div class="flex h-dvh bg-bg text-text overflow-hidden">
  <SideNav />
  <div class="flex flex-col flex-grow min-w-0 overflow-hidden">
    {#if title}<PhoneHeader {title} action={headerAction} />{/if}
    <SessionBanner />
    {@render children()}
    <LobbyStrip />
    <TabBar />
  </div>
</div>
