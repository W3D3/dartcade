<script lang="ts">
  // Under the next game (Lobby, Lobby-New, Tablet-Lobby boards): two tabs, "Friends · N online"
  // with every friend and Invite, and the lobby history. The host also sets who can join here.
  import { Check } from '@lucide/svelte'
  import type { Lobby, LobbyAccess } from '$lib/api/lobby-ws'
  import Avatar from '$lib/components/Avatar.svelte'
  import StatusRing from '$lib/components/friends/StatusRing.svelte'
  import ActivityList from './ActivityList.svelte'
  import LobbyAccessPanel from './LobbyAccessPanel.svelte'
  import { me } from '$lib/lobby/sockets'
  import { lobbyFriendRows } from '$lib/lobby/friendsTab'
  import { isOnline } from '$lib/friends/view'

  let {
    lobby,
    viewerId,
    host,
    oninvite,
    onaccess,
  }: {
    lobby: Lobby
    viewerId: string | null
    host: boolean
    oninvite: (userId: string) => Promise<boolean>
    onaccess: (access: LobbyAccess) => void
  } = $props()

  type Tab = 'friends' | 'history'
  let tab = $state<Tab>('friends')
  const friends = $derived($me?.friends?.friends ?? [])
  const loaded = $derived($me?.friends != null)
  const rows = $derived(lobbyFriendRows(friends))
  const online = $derived(friends.filter(isOnline).length)
  // One invite at a time; the row turns to "Invite sent" from the next push
  let inviting = $state<string | null>(null)
  async function invite(userId: string) {
    if (inviting) return
    inviting = userId
    try {
      await oninvite(userId)
    } finally {
      inviting = null
    }
  }

  const id = $props.id()
  const tabs = $derived([
    { key: 'friends' as const, label: `Friends · ${online} online` },
    { key: 'history' as const, label: 'Lobby history' },
  ])
  function onkey(e: KeyboardEvent) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Home' && e.key !== 'End') return
    e.preventDefault()
    tab = e.key === 'Home' ? 'friends' : e.key === 'End' ? 'history' : tab === 'friends' ? 'history' : 'friends'
    document.getElementById(`${id}-${tab}`)?.focus()
  }
  const TONE = { ink: 'text-text-muted', playing: 'text-live-text', muted: 'text-text-dim' }
</script>

<section
  aria-label="Friends and lobby history"
  class="flex flex-col gap-[10px] flex-grow min-h-0 box-border px-4 py-4 md:px-5 md:py-[18px] card"
>
  <div
    role="tablist"
    aria-label="Friends or lobby history"
    tabindex="-1"
    class="shrink-0 grid grid-flow-col auto-cols-fr gap-1 p-1 bg-bg rounded-[10px]"
    onkeydown={onkey}
  >
    {#each tabs as t (t.key)}
      {@const on = tab === t.key}
      <button
        type="button"
        role="tab"
        id="{id}-{t.key}"
        aria-selected={on}
        aria-controls="{id}-panel"
        tabindex={on ? 0 : -1}
        onclick={() => (tab = t.key)}
        class="h-[34px] px-3 rounded-[7px] border-0 font-[inherit] text-[14px] cursor-pointer truncate
               {on ? 'bg-line text-text font-semibold' : 'bg-transparent text-ink-2 hover:text-text'}">{t.label}</button
      >
    {/each}
  </div>

  <div id="{id}-panel" role="tabpanel" aria-labelledby="{id}-{tab}" class="flex flex-col gap-2 flex-grow min-h-0">
    {#if tab === 'friends'}
      <div class="flex flex-col gap-2 flex-grow min-h-0 overflow-y-auto scrollbar-themed pr-1">
        {#if loaded && rows.length === 0}
          <p class="m-0 py-2 text-[14px] text-text-muted">
            No friends yet. <a href="#/friends" class="font-semibold no-underline">Add a friend</a> and they show up here to invite.
          </p>
        {:else}
          <ul aria-label="Your friends" class="m-0 p-0 list-none flex flex-col">
            {#each rows as r (r.friend.id)}
              <li class="flex items-center gap-3 min-h-[52px] border-b border-surface-paused last:border-b-0">
                <span class="relative shrink-0 flex m-1">
                  <Avatar name={r.friend.name} size={32} />
                  <StatusRing kind={r.friend.status.kind} />
                </span>
                <span class="flex flex-col gap-px min-w-0 flex-grow">
                  <span class="text-[15px] font-semibold truncate">{r.friend.name}</span>
                  <span class="text-[12px] truncate {TONE[r.tone]}">{r.line}</span>
                </span>
                {#if r.state === 'in-lobby'}
                  <span
                    class="shrink-0 h-7 px-[10px] box-border flex items-center rounded-full border border-accent-line text-accent text-[12px] font-semibold"
                    >In lobby</span
                  >
                {:else if r.state === 'invited'}
                  <span
                    class="shrink-0 h-7 px-[10px] box-border flex items-center gap-1 rounded-full border border-warn-line text-warn text-[12px] font-semibold"
                    ><Check size={12} strokeWidth={3} />Invite sent</span
                  >
                {:else}
                  <button
                    type="button"
                    disabled={inviting !== null}
                    aria-label="Invite {r.friend.name} to {lobby.name}"
                    onclick={() => void invite(r.friend.id)}
                    class="shrink-0 h-9 px-[14px] rounded-[9px] border border-line-strong bg-transparent text-text text-[14px] font-semibold font-[inherit] cursor-pointer hover:bg-surface-active disabled:opacity-60"
                    >Invite</button
                  >
                {/if}
              </li>
            {/each}
          </ul>
          <p class="m-0 text-[12px] leading-[1.45] text-text-dim">
            Invited friends join once they accept. Someone not on your list? Add them by @username in People.
            <a href="#/friends" class="font-semibold no-underline">All friends</a>
          </p>
        {/if}
      </div>
      {#if host}
        <div class="shrink-0 pt-[10px] border-t border-surface-paused">
          <LobbyAccessPanel access={lobby.access} onchange={onaccess} />
        </div>
      {/if}
    {:else}
      <ActivityList activity={lobby.activity} {viewerId} since={lobby.createdAt} />
    {/if}
  </div>
</section>
