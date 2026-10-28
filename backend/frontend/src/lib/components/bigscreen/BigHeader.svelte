<script lang="ts">
  // The big screen's top bar: the wordmark, the game and its rules, the board's name and a LIVE or FINAL badge.
  import { LoaderCircle } from '@lucide/svelte'
  import type { BoardState } from '$lib/bigscreen/frame'
  import { bmDotColor, bmStatusLabel, DOT_BG, DOT_TEXT, SPINNING } from '$lib/boardStatus'
  import Wordmark from '$lib/components/Wordmark.svelte'

  let {
    title,
    meta,
    board,
    bm,
    final = false,
  }: {
    title: string
    meta: string
    board: string | null
    /** The board's Board Manager status (the dot and label of the board menu). */ bm: BoardState
    final?: boolean
  } = $props()
  const color = $derived(bmDotColor(bm.status ?? null, bm.online))
  const spinning = $derived(bm.online && SPINNING.has(bm.status ?? ''))
</script>

<header class="flex h-[88px] flex-none items-center gap-[22px] border-b-2 border-surface-inset px-[35px]">
  <Wordmark size={29} text="text-[29px]" badge={false} />
  <span class="h-9 w-0.5 bg-line"></span>
  <span class="whitespace-nowrap font-display text-[35px] font-bold">{title}</span>
  <span class="min-w-0 truncate text-[24px] text-text-muted">{meta}</span>
  <span class="ml-auto flex items-center gap-4">
    {#if board}<span class="whitespace-nowrap font-display text-[27px] font-bold uppercase tracking-[0.04em] text-ink-2">{board}</span>{/if}
    <span class="inline-flex items-center gap-2 text-[19px] font-semibold text-ink-2">
      {#if spinning}
        <LoaderCircle size={16} strokeWidth={3} class="shrink-0 animate-spin {DOT_TEXT[color]}" />
      {:else}
        <span class="size-2.5 shrink-0 rounded-full {DOT_BG[color]}"></span>
      {/if}
      {bmStatusLabel(bm.status ?? null, bm.online)}
    </span>
    <span
      class="inline-flex h-9 items-center gap-2 rounded-full px-[14px] text-[19px] font-extrabold tracking-[0.14em] {final
        ? 'bg-accent-tint text-accent'
        : 'bg-live-soft text-live'}"
    >
      {#if final}MATCH OVER{:else}<span class="size-2.5 animate-pulse rounded-full bg-live"></span>LIVE{/if}
    </span>
  </span>
</header>
