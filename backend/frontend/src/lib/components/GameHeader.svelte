<script lang="ts">
  import { ChevronLeft, Grid3x3, Settings, Target, X } from '@lucide/svelte'
  // Top bar of a live game: leave, title, meta and lobby, board/entry toggle, paused, board, settings, end.
  import BoardStatusPanel from '$lib/components/BoardStatusPanel.svelte'
  import { Button } from '$lib/components/ui/button/index.js'
  import RankedPill from '$lib/components/ranked/RankedPill.svelte'
  import WatchingPill from '$lib/components/watch/WatchingPill.svelte'
  import SettingsDrawer from '$lib/components/SettingsDrawer.svelte'
  import type { Board } from '$lib/api'
  import type { GameSettings } from '$lib/gameSettings.js'
  import type { MyBoard } from '$lib/remote'

  let {
    title,
    meta = '',
    boards,
    gameId,
    scoreBased = false,
    viewMode,
    canEnd,
    endMode = 'end',
    showViewToggle = true,
    compact = false,
    paused = false,
    myBoard = null,
    ranked = null,
    watching = 0,
    settings = $bindable(),
    onleave,
    onend,
    onviewmode,
  }: {
    title: string
    meta?: string
    /** The viewer's own boards currently in use in this game (whoever's seat they're on). */
    boards: Board[]
    gameId: string
    /** The game has a score the caller announces: the drawer shows the caller. */
    scoreBased?: boolean
    viewMode: 'board' | 'entry'
    /** Whether the end-of-game control shows at all. */
    canEnd: boolean
    /** The host ends the game for everyone; anyone else with seats leaves (forfeits them). */
    endMode?: 'end' | 'leave' | 'forfeit'
    showViewToggle?: boolean
    /** The phone header: back, title and meta, keypad toggle, end, settings. */
    compact?: boolean
    /** The game waits for a disconnected player: the bar says PAUSED. */
    paused?: boolean
    /** Remote games: the viewer's own board, and whether its bridge is connected. */
    myBoard?: MyBoard | null
    /** A ranked game: the pill and the stakes ("Win +16 · Loss −14", null while placing). */
    ranked?: { stakes: string | null } | null
    /** Friends watching the game (Watch). */
    watching?: number
    settings: GameSettings
    onleave: () => void
    onend: () => void
    onviewmode: (m: 'board' | 'entry') => void
  } = $props()

  let showSettings = $state(false)
  // A forfeit is the way out of a ranked game, from either Leave control: it asks first
  const forfeits = $derived(endMode === 'forfeit' && canEnd)
</script>

{#if compact}
  <header class="h-14 shrink-0 box-border pl-1 pr-3 flex items-center gap-[6px] border-b border-line bg-surface-1">
    <button
      type="button"
      onclick={forfeits ? onend : onleave}
      aria-label={forfeits ? 'Forfeit game' : 'Leave game'}
      class="size-11 shrink-0 flex items-center justify-center border-0 text-ink-2 cursor-pointer"
    >
      <ChevronLeft size={18} />
    </button>
    <div class="flex flex-col gap-[3px] min-w-0">
      <span class="flex items-center gap-[6px] min-w-0">
        <h1 class="font-display font-bold text-[20px] leading-none uppercase tracking-section whitespace-nowrap">{title}</h1>
        {#if paused}
          <span
            class="h-[18px] px-[6px] shrink-0 inline-flex items-center gap-1 rounded-full bg-surface-paused text-ink-2 text-[10px] font-bold tracking-[0.1em]"
          >
            <span class="size-[6px] rounded-[1px] bg-text-muted"></span>PAUSED
          </span>
        {:else if myBoard && !myBoard.online}
          <span
            role="status"
            class="h-[18px] px-[6px] shrink-0 inline-flex items-center gap-1 rounded-full border border-warn-line bg-warn-soft text-warn text-[10px] font-bold tracking-section whitespace-nowrap"
          >
            <span class="size-[6px] box-border rounded-full border-[1.5px] border-warn"></span>BOARD OFFLINE
          </span>
        {:else if ranked}
          <RankedPill />
        {/if}
      </span>
      {#if meta || ranked?.stakes}
        <span class="text-[12px] text-text-muted truncate">{[meta, ranked?.stakes].filter(Boolean).join(' · ')}</span>
      {/if}
    </div>
    <span class="ml-auto flex items-center gap-[6px] shrink-0">
      {#if showViewToggle}
        <Button
          variant="outline"
          size="icon"
          onclick={() => onviewmode(viewMode === 'board' ? 'entry' : 'board')}
          aria-label={viewMode === 'board' ? 'Enter darts by number' : 'Enter darts on the board'}
        >
          {#if viewMode === 'board'}<Grid3x3 size={19} />{:else}<Target size={19} />{/if}
        </Button>
      {/if}
      <WatchingPill count={watching} />
      {#each boards as b (b.id)}<BoardStatusPanel board={b} compact />{/each}
      <Button
        variant="outline"
        size="icon"
        onclick={() => (showSettings = !showSettings)}
        aria-label="Game settings"
        aria-haspopup="dialog"
        aria-expanded={showSettings}
        pressed={showSettings}
      >
        <Settings size={19} />
      </Button>
      {#if canEnd}
        <Button
          variant="destructive"
          size="icon"
          class="ml-1"
          onclick={onend}
          aria-label={forfeits ? 'Forfeit game' : endMode === 'end' ? 'End game' : 'Leave game'}
        >
          <X size={18} />
        </Button>
      {/if}
    </span>
  </header>
{:else}
  <header class="h-[60px] px-5 gap-[14px] xl:h-16 xl:px-7 xl:gap-6 shrink-0 box-border flex items-center border-b border-line bg-surface-1">
    <Button variant="outline" size="md" onclick={forfeits ? onend : onleave} class="pl-[10px] pr-[14px] text-ink-2">
      <ChevronLeft size={18} />
      {forfeits ? 'Forfeit' : 'Leave'}
    </Button>

    <div class="flex items-baseline gap-[10px] xl:gap-3 min-w-0">
      <h1 class="font-display font-bold text-[24px] xl:text-[26px] uppercase tracking-section leading-none shrink-0">{title}</h1>
      {#if meta}<span class="text-[13px] xl:text-[14px] text-text-muted truncate">{meta}</span>{/if}
      {#if ranked}
        <RankedPill />
        {#if ranked.stakes}<span class="shrink-0 font-mono text-[13px] text-text-muted">{ranked.stakes}</span>{/if}
      {/if}
    </div>

    <div class="ml-auto flex items-center gap-3 xl:gap-4 shrink-0">
      {#if showViewToggle}
        <div
          class="h-11 box-border flex items-center p-[3px] bg-bg rounded-md border border-line-strong"
          role="group"
          aria-label="Dart entry"
        >
          {#each [{ m: 'board', label: 'Board' }, { m: 'entry', label: 'Enter' }] as const as o (o.m)}
            <button
              type="button"
              onclick={() => onviewmode(o.m)}
              aria-pressed={viewMode === o.m}
              class="h-full px-3 rounded-segment text-[14px] font-medium border-0 cursor-pointer transition-colors
                   {viewMode === o.m ? 'bg-surface-key text-text' : 'bg-transparent text-text-dim hover:text-ink-2'}">{o.label}</button
            >
          {/each}
        </div>
      {/if}

      {#if paused}
        <span
          class="h-7 px-[10px] text-[12px] xl:h-[30px] xl:px-3 xl:text-[13px] inline-flex items-center gap-2 rounded-full bg-surface-paused text-ink-2 font-bold tracking-[0.1em]"
        >
          <span class="size-2 rounded-bar bg-text-muted"></span>PAUSED
        </span>
      {/if}

      <WatchingPill count={watching} />

      {#each boards as b (b.id)}
        <BoardStatusPanel board={b} />
      {/each}

      <Button
        variant="outline"
        size="icon"
        onclick={() => (showSettings = !showSettings)}
        aria-label="Game settings"
        aria-haspopup="dialog"
        aria-expanded={showSettings}
        pressed={showSettings}
      >
        <Settings size={22} />
      </Button>

      {#if canEnd && !forfeits}
        <span class="w-px h-6 bg-line-strong" aria-hidden="true"></span>
        <Button variant="destructive" size="md" onclick={onend}>
          <X size={14} />
          {endMode === 'end' ? 'End' : 'Leave'}
        </Button>
      {/if}
    </div>
  </header>
{/if}

{#if showSettings}
  <SettingsDrawer bind:settings {gameId} {scoreBased} bigScreenBoardId={boards[0]?.id ?? null} onclose={() => (showSettings = false)} />
{/if}
