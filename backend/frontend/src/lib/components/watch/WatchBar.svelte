<script lang="ts">
  // The Watch page's top bar: who you are watching, the game, live or offline, how many watch, and the way out.
  import { ChevronLeft, Eye } from '@lucide/svelte'
  import { Button } from '$lib/components/ui/button/index.js'
  import { watchingLabel, type WatchState } from '$lib/watch/view'

  let {
    title,
    game,
    meta = '',
    state,
    watchers,
    onleave,
  }: {
    /** Who is playing: "Lena vs Max". */
    title: string
    /** The game's name. */
    game: string
    meta?: string
    state: WatchState
    watchers: number | undefined
    onleave: () => void
  } = $props()

  const pill = $derived(
    state === 'live'
      ? { text: 'LIVE', cls: 'bg-live-soft text-live-text', dot: 'bg-live' }
      : state === 'over'
        ? { text: 'GAME OVER', cls: 'bg-surface-2 text-ink-2', dot: 'bg-text-muted' }
        : state === 'offline'
          ? { text: 'OFFLINE', cls: 'bg-warn-soft text-warn', dot: 'bg-warn' }
          : null,
  )
  const count = $derived(watchingLabel(watchers))
</script>

<header
  class="shrink-0 box-border flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-accent/40 bg-accent-tint px-4 py-2 sm:px-5 xl:px-7"
  aria-label="Watching"
>
  <Button variant="outline" size="md" onclick={onleave} class="pl-[10px] pr-[14px] text-ink-2">
    <ChevronLeft size={18} />
    {state === 'over' ? 'Back' : 'Stop watching'}
  </Button>
  <Eye size={18} class="shrink-0 text-accent" aria-hidden="true" />
  <p class="min-w-0 truncate text-[15px] text-text">You are watching <strong class="font-semibold">{title}</strong></p>
  <span class="hidden min-w-0 truncate text-[13px] text-text-muted sm:inline">{[game, meta].filter(Boolean).join(' · ')}</span>
  <span class="ml-auto flex items-center gap-3">
    {#if count}<span class="text-[13px] text-text-muted">{count}</span>{/if}
    {#if pill}
      <span class="inline-flex h-7 items-center gap-2 rounded-full px-3 text-[12px] font-bold tracking-[0.1em] {pill.cls}" role="status">
        <span class="size-2 rounded-full {pill.dot}"></span>{pill.text}
      </span>
    {/if}
  </span>
</header>
