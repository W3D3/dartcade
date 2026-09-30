<script lang="ts">
  // Top bar of a live game: leave, title and meta, board/entry toggle, end, live, board, settings.
  import BoardStatusPanel from '$lib/components/BoardStatusPanel.svelte'
  import SettingsDrawer from '$lib/components/SettingsDrawer.svelte'
  import type { GameSettings } from '$lib/gameSettings.js'
  import type { Snapshot } from '$lib/ws.js'

  let {
    title, meta = '', sessionId, boardId, bmStatus, viewMode, canEnd, showViewToggle = true,
    settings = $bindable(), onleave, onend, onviewmode,
  }: {
    title: string
    meta?: string
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
  const outline = 'h-11 flex items-center gap-2 rounded-[10px] border border-line-strong bg-transparent text-[14px] font-medium cursor-pointer shrink-0'
</script>

<header class="h-16 shrink-0 box-border px-7 flex items-center gap-6 border-b border-line bg-surface-1">
  <button type="button" onclick={onleave} class="{outline} pl-[10px] pr-[14px] text-ink-2">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
      stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>
    Leave
  </button>

  <div class="flex items-baseline gap-3 min-w-0">
    <h1 class="m-0 font-display font-bold text-[26px] uppercase tracking-[0.04em] leading-none shrink-0">{title}</h1>
    {#if meta}<span class="text-[14px] text-text-muted truncate">{meta}</span>{/if}
  </div>

  <div class="ml-auto flex items-center gap-4 shrink-0">
    {#if showViewToggle}
      <div class="flex items-center p-[3px] bg-bg rounded-[10px] border border-line-2" role="group" aria-label="Dart entry">
        {#each ([{ m: 'board', label: 'Board' }, { m: 'entry', label: 'Enter' }] as const) as o}
          <button type="button" onclick={() => onviewmode(o.m)} aria-pressed={viewMode === o.m}
            class="h-9 px-3 rounded-[7px] text-[14px] font-medium border-0 cursor-pointer transition-colors
                   {viewMode === o.m ? 'bg-surface-key text-text' : 'bg-transparent text-text-dim hover:text-ink-2'}">{o.label}</button>
        {/each}
      </div>
    {/if}

    {#if canEnd}
      <button type="button" onclick={onend} class="{outline} px-[14px] text-live-text">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
          stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12"/></svg>
        End
      </button>
    {/if}

    <span class="h-[30px] px-3 inline-flex items-center gap-2 rounded-full bg-live-soft text-live-text text-[13px] font-bold tracking-[0.1em]">
      <span class="w-2 h-2 rounded-full bg-live"></span>LIVE
    </span>

    {#if boardId !== null}
      <BoardStatusPanel {sessionId} {bmStatus} />
    {/if}

    <button type="button" onclick={() => showSettings = !showSettings}
      aria-label="Game settings" aria-haspopup="dialog" aria-expanded={showSettings}
      class="w-11 h-11 flex items-center justify-center rounded-[10px] border border-line-strong cursor-pointer transition-colors
             {showSettings ? 'bg-surface-key text-text' : 'bg-transparent text-ink-2 hover:text-text'}">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
        stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="3"/>
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
      </svg>
    </button>
  </div>
</header>

{#if showSettings}
  <SettingsDrawer bind:settings onclose={() => showSettings = false} />
{/if}
