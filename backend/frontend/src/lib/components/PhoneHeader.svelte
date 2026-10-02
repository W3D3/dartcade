<script lang="ts">
  // Top bar of a page on a phone: the board-ring mark, the title, an optional action (e.g. the board chip).
  import type { Snippet } from 'svelte'
  import AccountMenu from './AccountMenu.svelte'
  import BrandMark from './BrandMark.svelte'

  let { title, action }: { title: string; action?: Snippet } = $props()
</script>

<header class="md:hidden h-14 shrink-0 box-border pl-4 pr-2 flex items-center gap-3 border-b border-line bg-surface-1">
  <BrandMark size={26} />
  <h1 class="m-0 font-display font-bold text-[24px] uppercase tracking-[0.04em] leading-none whitespace-nowrap">{title}</h1>
  <div class="ml-auto flex items-center gap-2 min-w-0">
    {#if action}<div class="flex items-center min-w-0">{@render action()}</div>{/if}
    <AccountMenu />
  </div>
</header>
