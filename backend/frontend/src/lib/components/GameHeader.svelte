<script lang="ts">
  // Game-agnostic top bar for a live session: leave, title/subtitle,
  // board/entry toggle, end, live badge, board controls and settings.
  import { Badge } from '$lib/components/ui/badge/index.js'
  import BoardStatusPanel from '$lib/components/BoardStatusPanel.svelte'
  import GameSettingsPanel from '$lib/components/GameSettingsPanel.svelte'
  import type { GameSettings } from '$lib/gameSettings.js'
  import type { Snapshot } from '$lib/ws.js'

  let {
    title, subtitle = '', sessionId, boardId, bmStatus, viewMode, canEnd, showViewToggle = true,
    settings = $bindable(), onleave, onend, onviewmode,
  }: {
    title: string
    subtitle?: string
    sessionId: string
    boardId: string | null
    bmStatus: Snapshot['bmStatus']
    viewMode: 'board' | 'entry'
    canEnd: boolean
    showViewToggle?: boolean
    settings: GameSettings
    onleave: () => void
    onend: () => void
    onviewmode: (m: 'board' | 'entry') => void
  } = $props()

  let showSettings = $state(false)
</script>

<header class="h-16 flex-shrink-0 box-border px-6 flex items-center gap-5
               border-b border-line bg-surface-1">
  <button type="button" onclick={onleave}
    class="flex items-center gap-2 h-9 px-3 border border-line-3 rounded-[8px]
           text-[#8a8e83] text-[13px] font-medium bg-transparent cursor-pointer shrink-0">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M15 6l-6 6 6 6"/>
    </svg>
    Leave
  </button>

  <div class="flex flex-col justify-center min-w-0">
    <h1 class="m-0 font-display font-bold text-[22px] uppercase tracking-[0.05em] leading-none">
      {title}
    </h1>
    {#if subtitle}
      <span class="text-[12px] text-text-dim leading-none mt-[3px] truncate">{subtitle}</span>
    {/if}
  </div>

  <div class="ml-auto flex items-center gap-3 shrink-0">
    {#if showViewToggle}
    <!-- Board / Enter toggle -->
    <div class="flex items-center gap-0 p-[3px] bg-[#0f100e] rounded-[8px] border border-line-2">
      <button type="button" onclick={() => onviewmode('board')}
        aria-pressed={viewMode === 'board'}
        class="h-8 px-3 rounded-[5px] text-[13px] font-medium border-0 cursor-pointer transition-colors
               {viewMode === 'board' ? 'bg-surface-2 text-text' : 'bg-transparent text-[#6a6e63] hover:text-[#c9c9bf]'}">
        Board
      </button>
      <button type="button" onclick={() => onviewmode('entry')}
        aria-pressed={viewMode === 'entry'}
        class="h-8 px-3 rounded-[5px] text-[13px] font-medium border-0 cursor-pointer transition-colors
               {viewMode === 'entry' ? 'bg-surface-2 text-text' : 'bg-transparent text-[#6a6e63] hover:text-[#c9c9bf]'}">
        Enter
      </button>
    </div>
    {/if}

    {#if canEnd}
      <button type="button" onclick={onend}
        class="flex items-center gap-2 h-9 px-3 border border-line-3 rounded-[8px]
               text-live-text text-[13px] font-medium bg-transparent cursor-pointer">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M18 6L6 18M6 6l12 12"/>
        </svg>
        End
      </button>
    {/if}
    <Badge variant="live">LIVE</Badge>
    {#if boardId !== null}
      <BoardStatusPanel {sessionId} {bmStatus} />
    {/if}

    <!-- Settings cog -->
    <div class="relative">
      <button type="button"
        onclick={() => showSettings = !showSettings}
        aria-label="Game settings"
        class="flex items-center justify-center w-9 h-9 rounded-[8px] border border-line-3
               {showSettings ? 'bg-surface-2 text-text' : 'bg-transparent text-[#8a8e83]'}
               cursor-pointer transition-colors hover:bg-surface-2 hover:text-text">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="3"/>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
        </svg>
      </button>
      {#if showSettings}
        <GameSettingsPanel
          {settings}
          onchange={s => { settings = s }}
          onclose={() => showSettings = false}
        />
      {/if}
    </div>
  </div>
</header>
