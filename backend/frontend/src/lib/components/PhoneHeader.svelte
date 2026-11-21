<script lang="ts">
  // Top bar of a page on a phone: the board-ring mark, the title, an optional action (e.g. the board chip).
  import type { Snippet } from 'svelte'
  import AccountMenu from './AccountMenu.svelte'
  import { hrefs } from '$lib/routes'
  import BrandMark from './BrandMark.svelte'
  import PreviewBadge from './PreviewBadge.svelte'
  import AlphaBadge from './feedback/AlphaBadge.svelte'
  import ReportBugButton from './feedback/ReportBugButton.svelte'

  let { title, action }: { title: string; action?: Snippet } = $props()
</script>

<header class="md:hidden h-14 shrink-0 box-border pl-4 pr-2 flex items-center gap-2 border-b border-line bg-surface-1">
  <a href={hrefs.home()} aria-label="Dartcade home" class="flex shrink-0"><BrandMark size={26} /></a>
  <h1 class="font-display font-bold text-[24px] uppercase tracking-section leading-none min-w-14 truncate" {title}>{title}</h1>
  <div class="hidden min-[430px]:flex shrink-0 items-center gap-2"><AlphaBadge /><PreviewBadge /></div>
  <div class="ml-auto shrink-0 flex items-center gap-2">
    {#if action}<div class="flex items-center min-w-0 max-w-[28vw] overflow-hidden">{@render action()}</div>{/if}
    <ReportBugButton />
    <AccountMenu />
  </div>
</header>
