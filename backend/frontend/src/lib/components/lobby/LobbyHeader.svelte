<script lang="ts">
  // The lobby's name (the host renames it), who hosts, the code and a link to join, the QR code,
  // and Close (the host) or Leave (everyone else).
  import { Check, Copy, Pencil, QrCode as QrIcon, RefreshCw, Share2 } from '@lucide/svelte'
  import type { Lobby } from '$lib/api/lobby-ws'
  import { Button } from '$lib/components/ui/button/index.js'
  import ConfirmModal from '$lib/components/ConfirmModal.svelte'
  import QrCode from './QrCode.svelte'
  import { formatCode, joinLink } from '$lib/lobby/format'
  import { boardSummary, counts, isHost } from '$lib/lobby/rules'

  let { lobby, viewerId, onrename, onnewcode, onclose, onleave }: {
    lobby: Lobby
    viewerId: string | null
    /** Resolves true once the name is saved. */
    onrename: (name: string) => Promise<boolean>
    /** The host makes a new code; the old link and QR code stop working. */
    onnewcode: () => void
    onclose: () => void
    onleave: () => void
  } = $props()

  const host = $derived(isHost(lobby, viewerId))
  // The server won't close a lobby while its game runs
  const gameRunning = $derived(lobby.currentSessionId !== null)
  const hostName = $derived(lobby.people.find(p => p.userId !== null && p.userId === lobby.hostUserId)?.name ?? null)
  const link = $derived(joinLink(window.location.origin, lobby.code))
  const c = $derived(counts(lobby))
  const boards = $derived(boardSummary(lobby))
  const myGuests = $derived(lobby.people.filter(p => p.userId === null && p.addedByUserId === viewerId).map(p => p.name))
  const leaveBody = $derived(myGuests.length === 0
    ? 'You can join again with the code.'
    : `${myGuests.join(', ')} ${myGuests.length === 1 ? 'leaves' : 'leave'} with you.`)

  let renaming = $state(false)
  let draft = $state('')
  let copied = $state(false)
  let showQr = $state(false)
  let confirm = $state<'close' | 'leave' | 'code' | null>(null)
  const iconButton = 'w-9 h-9 shrink-0 flex items-center justify-center rounded-[8px] cursor-pointer'

  async function saveName() {
    const name = draft.trim()
    if (!name || name === lobby.name) { renaming = false; return }
    if (await onrename(name)) renaming = false
  }

  async function share() {
    // Phones hand the link to messages or mail; elsewhere (or when that's cancelled) it's copied
    if ('share' in navigator) {
      try { await navigator.share({ title: lobby.name, url: link }); return } catch { /* copy instead */ }
    }
    try {
      await navigator.clipboard.writeText(link)
      copied = true
      setTimeout(() => { copied = false }, 2000)
    } catch { /* no clipboard: the code is on screen */ }
  }
</script>

<header class="flex flex-col md:flex-row md:items-end md:justify-between gap-3 md:gap-6">
  <div class="flex flex-col gap-1 md:gap-2 min-w-0">
    {#if renaming}
      <form class="flex items-center gap-2" onsubmit={(e) => { e.preventDefault(); void saveName() }}>
        <input bind:value={draft} maxlength="48" aria-label="Lobby name"
          class="h-11 min-w-0 flex-grow box-border px-3 rounded-[9px] bg-bg border border-line-chip text-text text-[18px] font-[inherit]" />
        <Button variant="accent" type="submit" aria-label="Save the name" class="w-11 px-0"><Check size={18} strokeWidth={2.5} /></Button>
      </form>
    {:else}
      <div class="flex items-center gap-3 min-w-0">
        <h2 class="m-0 font-display font-bold text-[34px] md:text-[48px] leading-none uppercase tracking-[0.02em] truncate">{lobby.name}</h2>
        {#if host}
          <button type="button" aria-label="Rename the lobby" onclick={() => { draft = lobby.name; renaming = true }}
            class="{iconButton} bg-transparent border border-line-chip text-ink-2"><Pencil size={16} /></button>
        {/if}
      </div>
    {/if}
    <p class="m-0 flex flex-wrap items-center gap-x-[6px] gap-y-1 text-[13px] md:text-[15px] text-text-muted">
      <span class="inline-flex items-center gap-[6px] text-accent font-semibold"><span class="w-2 h-2 rounded-full bg-accent"></span>Lobby open</span>
      <span>· {host ? "You're the host" : `Hosted by ${hostName ?? 'nobody yet'}`}</span>
      <span>· {c.people} {c.people === 1 ? 'person' : 'people'}</span>
      {#if boards}<span>· {boards}</span>{/if}
    </p>
  </div>

  <div class="flex items-center gap-2 md:gap-[10px] flex-wrap">
    <div class="flex items-center gap-[10px] md:gap-3 h-[46px] md:h-12 box-border pl-3 md:pl-4 pr-[6px] md:pr-2 border border-line-chip rounded-[10px] bg-surface-panel">
      <span class="text-[12px] md:text-[13px] text-text-muted">Code</span>
      <span class="font-mono text-[17px] md:text-[20px] font-medium tracking-[0.12em]">{formatCode(lobby.code)}</span>
      <button type="button" onclick={() => void share()}
        class="h-9 px-[10px] md:px-3 flex items-center gap-[6px] border-0 rounded-[8px] bg-surface-key text-text text-[13px] md:text-[14px] font-semibold cursor-pointer font-[inherit]">
        {#if copied}
          <Check size={15} />Copied
        {:else}
          <span class="md:hidden flex items-center gap-[6px]"><Share2 size={15} />Share link</span>
          <span class="hidden md:flex items-center gap-[6px]"><Copy size={15} />Copy link</span>
        {/if}
      </button>
      <button type="button" aria-label="Show the QR code" aria-expanded={showQr} onclick={() => showQr = !showQr}
        class="{iconButton} border-0 bg-surface-key text-text"><QrIcon size={17} /></button>
      {#if host}
        <button type="button" aria-label="Make a new code" title="New code" onclick={() => confirm = 'code'}
          class="{iconButton} border-0 bg-surface-key text-text"><RefreshCw size={16} /></button>
      {/if}
    </div>
    <Button variant="destructive" onclick={() => confirm = host ? 'close' : 'leave'} class="h-[46px] md:h-12"
      disabled={host && gameRunning} title={host && gameRunning ? 'Abort the game first' : undefined}>
      {host ? 'Close lobby' : 'Leave lobby'}
    </Button>
    {#if host && gameRunning}<span class="text-[12px] text-text-dim">Abort the game first</span>{/if}
  </div>
</header>

{#if showQr}
  <div class="self-start md:self-end flex items-center gap-4 p-4 rounded-[14px] bg-surface-panel border border-line-2">
    <QrCode text={link} />
    <p class="m-0 max-w-[200px] text-[14px] leading-[1.45] text-text-muted">
      Point a phone's camera here to join <strong class="text-text">{lobby.name}</strong>.
    </p>
  </div>
{/if}

{#if confirm === 'close'}
  <ConfirmModal title="Close {lobby.name}?" body="Everyone leaves the lobby and pending invites expire."
    confirmLabel="Close lobby" cancelLabel="Keep it open" danger
    onconfirm={() => { confirm = null; onclose() }} oncancel={() => confirm = null} />
{:else if confirm === 'leave'}
  <ConfirmModal title="Leave {lobby.name}?" body={leaveBody} confirmLabel="Leave lobby" cancelLabel="Stay" danger
    onconfirm={() => { confirm = null; onleave() }} oncancel={() => confirm = null} />
{:else if confirm === 'code'}
  <ConfirmModal title="Make a new code?" body="The old code, link and QR code stop working. People already in the lobby stay."
    confirmLabel="New code" cancelLabel="Keep this one"
    onconfirm={() => { confirm = null; onnewcode() }} oncancel={() => confirm = null} />
{/if}
