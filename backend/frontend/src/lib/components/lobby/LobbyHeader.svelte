<script lang="ts">
  // The lobby's name (the host renames it), who hosts, and - while the lobby isn't solo - the
  // code and a link to join, the QR code, and Close (the host) or Leave (everyone). While solo
  // none of that applies: there's nobody to invite with, and nothing to close or leave.
  import { Check, Pencil } from '@lucide/svelte'
  import type { Lobby } from '$lib/api/lobby-ws'
  import { Button } from '$lib/components/ui/button/index.js'
  import IconButton from '$lib/components/IconButton.svelte'
  import JoinCodeCard from './JoinCodeCard.svelte'
  import LeaveLobbyConfirm from './LeaveLobbyConfirm.svelte'
  import { boardSummary, counts, isHost } from '$lib/lobby/rules'
  import ConfirmModal from '$lib/components/ConfirmModal.svelte'

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
  const c = $derived(counts(lobby))
  const boards = $derived(boardSummary(lobby))
  const myGuests = $derived(lobby.people.filter(p => p.userId === null && p.addedByUserId === viewerId).map(p => p.name))

  let renaming = $state(false)
  let draft = $state('')
  let confirm = $state<'close' | 'leave' | null>(null)

  async function saveName() {
    const name = draft.trim()
    if (!name || name === lobby.name) { renaming = false; return }
    if (await onrename(name)) renaming = false
  }
</script>

<header class="flex flex-col md:flex-row md:items-end md:justify-between gap-3 md:gap-6">
  <div class="flex flex-col gap-1 md:gap-2 min-w-0">
    {#if renaming}
      <form class="flex items-center gap-2" onsubmit={(e) => { e.preventDefault(); void saveName() }}>
        <input bind:value={draft} maxlength="48" aria-label="Lobby name"
          class="h-11 min-w-0 flex-grow box-border px-3 rounded-[9px] bg-bg border border-line-chip text-text text-[18px] font-[inherit]" />
        <Button variant="accent" size="icon" type="submit" aria-label="Save the name"><Check size={18} strokeWidth={2.5} /></Button>
      </form>
    {:else}
      <div class="flex items-center gap-3 min-w-0">
        <h2 class="m-0 font-display font-bold text-[34px] md:text-[48px] leading-none uppercase tracking-[0.02em] truncate">{lobby.name}</h2>
        {#if host}
          <IconButton tone="outline" label="Rename the lobby" onclick={() => { draft = lobby.name; renaming = true }}><Pencil size={16} /></IconButton>
        {/if}
      </div>
    {/if}
    <p class="m-0 flex flex-wrap items-center gap-x-[6px] gap-y-1 text-[13px] md:text-[15px] text-text-muted">
      <span class="inline-flex items-center gap-[6px] text-accent font-semibold"><span class="w-2 h-2 rounded-full bg-accent"></span>Lobby open</span>
      {#if !lobby.solo}<span>· {host ? "You're the host" : `Hosted by ${lobby.hostName ?? 'nobody yet'}`}</span>{/if}
      <span>· {c.people} {c.people === 1 ? 'person' : 'people'}</span>
      {#if boards}<span>· {boards}</span>{/if}
    </p>
  </div>

  {#if !lobby.solo}
    <div class="flex flex-col gap-1 md:items-end">
      <div class="flex items-center gap-2 md:gap-[10px] flex-wrap md:justify-end">
        <JoinCodeCard code={lobby.code} name={lobby.name} {host} {onnewcode} />
        <!-- Leave and Close stay together: beside the code card, or both under it -->
        <div class="flex items-center gap-2 md:gap-[10px] shrink-0">
          {#if !host}
            <Button variant="destructive" onclick={() => confirm = 'leave'} class="h-[46px] md:h-12">Leave lobby</Button>
          {:else}
            <Button variant="outline" size="md" onclick={() => confirm = 'leave'} class="h-[46px] md:h-12"
              disabled={gameRunning} title={gameRunning ? 'End the game first' : undefined}>Leave lobby</Button>
            <Button variant="destructive" onclick={() => confirm = 'close'} class="h-[46px] md:h-12"
              disabled={gameRunning} title={gameRunning ? 'End the game first' : undefined}>Close lobby</Button>
          {/if}
        </div>
      </div>
      {#if host && gameRunning}<span class="text-[12px] text-text-dim">End the game first</span>{/if}
    </div>
  {/if}
</header>

{#if confirm === 'close'}
  <ConfirmModal title="Close {lobby.name}?" body="Everyone leaves the lobby and pending invites expire."
    confirmLabel="Close lobby" cancelLabel="Keep it open" danger
    onconfirm={() => { confirm = null; onclose() }} oncancel={() => confirm = null} />
{:else if confirm === 'leave'}
  <LeaveLobbyConfirm name={lobby.name} guestNames={myGuests} nextHostName={host ? lobby.nextHostName : null}
    onconfirm={() => { confirm = null; onleave() }} oncancel={() => confirm = null} />
{/if}
