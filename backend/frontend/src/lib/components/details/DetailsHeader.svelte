<script lang="ts">
  // The details page's header bar: the breadcrumb back to the list, the mode, the meta line and your result.
  import { Ban, Trash } from '@lucide/svelte'
  import { Breadcrumb, type BreadcrumbItem } from '$lib/components/ui/breadcrumb/index.js'
  import { Button } from '$lib/components/ui/button/index.js'
  import type { GameDetail } from '$lib/api'
  import { getGameView } from '$lib/gameViews'
  import { resultLabel } from '$lib/history'
  import { metaLine } from '$lib/details/page'

  let {
    detail,
    trail,
    oninvalidate,
    ondelete,
  }: { detail: GameDetail; trail: BreadcrumbItem[]; oninvalidate?: () => void; ondelete?: () => void } = $props()
  const result = $derived(resultLabel(detail.game))
</script>

<header
  class="shrink-0 flex flex-wrap items-center gap-x-6 gap-y-2 min-h-14 md:min-h-16 box-border px-4 md:px-7 py-2 border-b border-line bg-surface-1"
>
  <div class="flex min-w-0 flex-col gap-1.5">
    <Breadcrumb items={trail} />
    <div class="flex items-baseline gap-3 min-w-0 flex-wrap">
      <h1 class="m-0 font-display font-bold text-[24px] md:text-[26px] uppercase tracking-[0.04em]">
        {getGameView(detail.game.mode).title}
      </h1>
      <span class="text-[13px] md:text-[14px] text-text-muted">{metaLine(detail)}</span>
    </div>
  </div>
  {#if result.text}
    <span
      class="ml-auto h-[30px] px-3 inline-flex items-center rounded-full text-[13px] font-bold tracking-[0.08em] uppercase
             {result.won ? 'bg-accent text-accent-fg' : 'border border-line-chip text-ink-2'}">{result.text}</span
    >
  {/if}
  {#if oninvalidate}
    <Button variant="destructive" size="md" class={result.text ? '' : 'ml-auto'} onclick={oninvalidate}
      ><Ban size={16} />Invalidate game</Button
    >
  {/if}
  {#if ondelete}
    <Button variant="destructive" size="md" class={result.text || oninvalidate ? '' : 'ml-auto'} onclick={ondelete}
      ><Trash size={16} />Delete game</Button
    >
  {/if}
</header>
