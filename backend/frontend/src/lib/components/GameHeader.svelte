<script lang="ts">
  import { ChevronLeft, Grid3x3, Settings, Target, X } from '@lucide/svelte'
  // Top bar of a live game: leave, title, meta and lobby, board/entry toggle, end, live or paused, board, settings.
  import BoardStatusPanel from '$lib/components/BoardStatusPanel.svelte'
  import SettingsDrawer from '$lib/components/SettingsDrawer.svelte'
  import type { GameSettings } from '$lib/gameSettings.js'
  import type { MyBoard } from '$lib/remote'
  import type { Snapshot } from '$lib/ws.js'

  let {
    title, meta = '', sessionId, boardId, gameId, bmStatus, viewMode, canEnd, showViewToggle = true, compact = false,
    lobbyName = null, paused = false, myBoard = null,
    settings = $bindable(), onleave, onend, onviewmode,
  }: {
    title: string
    meta?: string
    sessionId: string
    boardId: string | null
    gameId: string
    bmStatus: Snapshot['bmStatus']
    viewMode: 'board' | 'entry'
    canEnd: boolean
    showViewToggle?: boolean
    /** The phone header: back, title with LIVE and meta, keypad toggle, end, settings. */
    compact?: boolean
    /** The lobby the game was started from (lobby games). */
    lobbyName?: string | null
    /** The game waits for a disconnected player: PAUSED instead of LIVE. */
    paused?: boolean
    /** Remote games: the viewer's own board, and whether its bridge is connected. */
    myBoard?: MyBoard | null
    settings: GameSettings
    onleave: () => void
    onend: () => void
    onviewmode: (m: 'board' | 'entry') => void
  } = $props()

  let showSettings = $state(false)
  const outline = 'h-11 flex items-center gap-2 rounded-[10px] border border-line-strong bg-transparent text-[14px] font-medium cursor-pointer shrink-0'
</script>

{#if compact}
<header class="h-14 shrink-0 box-border pl-1 pr-3 flex items-center gap-[6px] border-b border-line bg-surface-1">
  <button type="button" onclick={onleave} aria-label="Leave game"
    class="w-11 h-11 shrink-0 flex items-center justify-center bg-transparent border-0 text-ink-2 cursor-pointer">
    <ChevronLeft size={18} />
  </button>
  <div class="flex flex-col gap-[3px] min-w-0">
    <span class="flex items-center gap-[6px] min-w-0">
      <h1 class="m-0 font-display font-bold text-[20px] leading-none uppercase tracking-[0.04em] whitespace-nowrap">{title}</h1>
      {#if paused}
        <span class="h-[18px] px-[6px] shrink-0 inline-flex items-center gap-1 rounded-full bg-surface-paused text-ink-2 text-[10px] font-bold tracking-[0.1em]">
          <span class="w-[6px] h-[6px] rounded-[1px] bg-text-muted"></span>PAUSED
        </span>
      {:else if myBoard && !myBoard.online}
        <span role="status" class="h-[18px] px-[6px] shrink-0 inline-flex items-center gap-1 rounded-full border border-warn-line bg-warn-soft text-warn text-[10px] font-bold tracking-[0.04em] whitespace-nowrap">
          <span class="w-[6px] h-[6px] box-border rounded-full border-[1.5px] border-warn"></span>BOARD OFFLINE
        </span>
      {:else}
        <span class="h-[18px] px-[6px] inline-flex items-center gap-1 rounded-full bg-live-soft text-live-text text-[10px] font-bold tracking-[0.1em]">
          <span class="w-[6px] h-[6px] rounded-full bg-live"></span>LIVE
        </span>
      {/if}
      {#if lobbyName}
        <span title="Lobby game" class="h-[18px] px-[6px] min-w-0 inline-flex items-center rounded-full border border-accent-line text-accent text-[10px] font-semibold"><span class="truncate">{lobbyName}</span></span>
      {/if}
    </span>
    {#if meta}<span class="text-[12px] text-text-muted truncate">{meta}</span>{/if}
  </div>
  <span class="ml-auto flex items-center gap-[6px] shrink-0">
    {#if showViewToggle}
      <button type="button" onclick={() => onviewmode(viewMode === 'board' ? 'entry' : 'board')}
        aria-label={viewMode === 'board' ? 'Enter darts by number' : 'Enter darts on the board'}
        class="w-11 h-11 flex items-center justify-center rounded-[10px] border border-line-chip bg-transparent text-ink-2 cursor-pointer">
        {#if viewMode === 'board'}<Grid3x3 size={19} />{:else}<Target size={19} />{/if}
      </button>
    {/if}
    {#if canEnd}
      <button type="button" onclick={onend} aria-label="End game"
        class="w-11 h-11 flex items-center justify-center rounded-[10px] border border-line-chip bg-transparent text-live-text cursor-pointer">
        <X size={18} />
      </button>
    {/if}
    {#if boardId !== null}<BoardStatusPanel {sessionId} {bmStatus} compact />{/if}
    <button type="button" onclick={() => showSettings = !showSettings}
      aria-label="Game settings" aria-haspopup="dialog" aria-expanded={showSettings}
      class="w-11 h-11 flex items-center justify-center rounded-[10px] border border-line-chip cursor-pointer
             {showSettings ? 'bg-surface-key text-text' : 'bg-transparent text-ink-2'}">
      <Settings size={19} />
    </button>
  </span>
</header>
{:else}
<header class="h-16 shrink-0 box-border px-7 flex items-center gap-6 border-b border-line bg-surface-1">
  <button type="button" onclick={onleave} class="{outline} pl-[10px] pr-[14px] text-ink-2">
    <ChevronLeft size={18} />
    Leave
  </button>

  <div class="flex items-baseline gap-3 min-w-0">
    <h1 class="m-0 font-display font-bold text-[26px] uppercase tracking-[0.04em] leading-none shrink-0">{title}</h1>
    {#if meta}<span class="text-[14px] text-text-muted truncate">{meta}</span>{/if}
    {#if lobbyName}
      <span title="Lobby game" class="self-center shrink-0 max-w-[240px] h-7 px-[10px] inline-flex items-center rounded-full bg-surface-active border border-accent-line text-accent text-[13px] font-semibold"><span class="truncate">{lobbyName}</span></span>
    {/if}
  </div>

  <div class="ml-auto flex items-center gap-4 shrink-0">
    {#if showViewToggle}
      <div class="flex items-center p-[3px] bg-bg rounded-[10px] border border-line-2" role="group" aria-label="Dart entry">
        {#each ([{ m: 'board', label: 'Board' }, { m: 'entry', label: 'Enter' }] as const) as o (o.m)}
          <button type="button" onclick={() => onviewmode(o.m)} aria-pressed={viewMode === o.m}
            class="h-9 px-3 rounded-[7px] text-[14px] font-medium border-0 cursor-pointer transition-colors
                   {viewMode === o.m ? 'bg-surface-key text-text' : 'bg-transparent text-text-dim hover:text-ink-2'}">{o.label}</button>
        {/each}
      </div>
    {/if}

    {#if canEnd}
      <button type="button" onclick={onend} class="{outline} px-[14px] text-live-text">
        <X size={14} />
        End
      </button>
    {/if}

    {#if paused}
      <span class="h-[30px] px-3 inline-flex items-center gap-2 rounded-full bg-surface-paused text-ink-2 text-[13px] font-bold tracking-[0.1em]">
        <span class="w-2 h-2 rounded-[2px] bg-text-muted"></span>PAUSED
      </span>
    {:else}
      <span class="h-[30px] px-3 inline-flex items-center gap-2 rounded-full bg-live-soft text-live-text text-[13px] font-bold tracking-[0.1em]">
        <span class="w-2 h-2 rounded-full bg-live"></span>LIVE
      </span>
    {/if}

    {#if myBoard}
      {#if myBoard.online}
        <span title="Board connected" class="h-[30px] px-3 inline-flex items-center gap-[7px] rounded-full border border-line-chip text-ink-2 text-[13px] font-medium whitespace-nowrap">
          <span class="w-2 h-2 rounded-full bg-accent"></span>{myBoard.name}
        </span>
      {:else}
        <span role="status" class="h-[30px] px-3 inline-flex items-center gap-[7px] rounded-full border border-warn-line bg-warn-soft text-warn text-[13px] font-semibold whitespace-nowrap">
          <span class="w-2 h-2 box-border rounded-full border-[1.5px] border-warn"></span>{myBoard.name} · offline
        </span>
      {/if}
    {/if}

    {#if boardId !== null}
      <BoardStatusPanel {sessionId} {bmStatus} />
    {/if}

    <button type="button" onclick={() => showSettings = !showSettings}
      aria-label="Game settings" aria-haspopup="dialog" aria-expanded={showSettings}
      class="w-11 h-11 flex items-center justify-center rounded-[10px] border border-line-strong cursor-pointer transition-colors
             {showSettings ? 'bg-surface-key text-text' : 'bg-transparent text-ink-2 hover:text-text'}">
      <Settings size={22} />
    </button>
  </div>
</header>
{/if}

{#if showSettings}
  <SettingsDrawer bind:settings {gameId} onclose={() => showSettings = false} />
{/if}
