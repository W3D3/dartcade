<script lang="ts">
  // The newest lobby invite you haven't closed (Lobby-Invite, Lobby-Invite-Phone): bottom right
  // on desktops, on top on phones. Closing it only hides it; the invite stays in your invites.
  // Not where invites are listed already: the Invites page, the friends drawer.
  import { X } from '@lucide/svelte'
  import { location } from 'svelte-spa-router'
  import FaceStack from '$lib/components/FaceStack.svelte'
  import InviteAnswer from './InviteAnswer.svelte'
  import InviteAvatar from './InviteAvatar.svelte'
  import InviteFeedback from './InviteFeedback.svelte'
  import LobbyGlance from './LobbyGlance.svelte'
  import { InviteActions, leavingFor } from '$lib/lobby/invites.svelte'
  import { inviteLine, inviteTime } from '$lib/lobby/format'
  import { me } from '$lib/lobby/sockets'
  import { friendsDrawerOpen } from '$lib/friends/drawer'
  import { sessionStore } from '$lib/returnTo'

  // Closed for this tab's session: a reload keeps it closed, a new tab shows it again
  const CLOSED_KEY = 'dartcade.invites.closed'
  const store = sessionStore()
  function readClosed(): string[] {
    try {
      const v: unknown = JSON.parse(store?.getItem(CLOSED_KEY) ?? '[]')
      return Array.isArray(v) ? v.filter(x => typeof x === 'string') : []
    } catch {
      return []
    }
  }
  let closed = $state(readClosed())
  function close(id: string) {
    closed = [...closed, id]
    try {
      store?.setItem(CLOSED_KEY, JSON.stringify(closed))
    } catch {
      // Storage refused: it stays closed until the page reloads
    }
  }

  const actions = new InviteActions()
  const hidden = $derived($friendsDrawerOpen || $location === '/invites')
  // Invites come newest first
  const invite = $derived(hidden ? undefined : $me?.invites.find(i => !closed.includes(i.id)))
  const leaving = $derived(invite ? leavingFor($me?.lobby, invite) : null)
</script>

{#if invite}
  {@const inviter = invite.inviterName ?? 'Someone'}
  <section
    aria-live="polite"
    aria-labelledby="invite-toast-title"
    aria-describedby="invite-toast-desc"
    class="fixed z-[150] box-border flex flex-col gap-[14px] rounded-[16px] border border-line-chip bg-surface-active shadow-[0_24px_60px_rgba(0,0,0,.55)]
           top-2 inset-x-2 p-[14px] md:top-auto md:left-auto md:right-7 md:bottom-7 md:w-[404px] md:px-5 md:pt-[18px] md:pb-5"
  >
    <div class="flex items-center gap-2">
      <span class="inline-flex items-center gap-[7px] text-[12px] font-bold label-caps text-accent">
        <span class="w-[7px] h-[7px] rounded-full bg-accent animate-pulse motion-reduce:animate-none"></span>Lobby invite
      </span>
      <span class="text-[12px] text-text-dim">· {inviteTime(invite.createdAt, new Date())}</span>
      <button
        type="button"
        aria-label="Close. The invite stays in your invites"
        onclick={() => close(invite.id)}
        class="ml-auto -mr-2 w-8 h-8 flex items-center justify-center rounded-[8px] bg-transparent border-0 text-text-muted cursor-pointer hover:bg-surface-hover"
      >
        <X size={18} />
      </button>
    </div>
    <div class="flex items-center gap-3">
      <InviteAvatar name={inviter} size={46} offset="ring-offset-surface-active" />
      <span class="flex flex-col gap-[2px] min-w-0">
        <span id="invite-toast-desc" class="text-[15px] text-ink-2 wrap-anywhere">
          <strong class="text-text">{inviter}</strong>
          invited you to <span class="md:hidden">{invite.lobbyName}</span><span class="max-md:hidden">play</span>
        </span>
        <span
          id="invite-toast-title"
          class="max-md:hidden font-display font-bold text-[30px] leading-none uppercase tracking-[0.01em] truncate"
          >{invite.lobbyName}</span
        >
        <span class="md:hidden flex items-center gap-2 text-[13px] text-text-muted min-w-0">
          <FaceStack faces={invite.faces} size={22} /><span class="truncate">{inviteLine(invite)}</span>
        </span>
      </span>
    </div>
    <LobbyGlance glance={invite} class="max-md:hidden bg-surface-panel" />
    {#if leaving}
      <p class="m-0 px-[14px] py-[10px] rounded-[10px] bg-surface-panel border border-line text-[13px] leading-[1.45] text-text-muted">
        Joining takes you out of <strong class="text-text">{leaving}</strong>. You can only be in one lobby.
      </p>
    {/if}
    <InviteFeedback {actions} />
    <InviteAnswer {invite} {actions} />
  </section>
{/if}
