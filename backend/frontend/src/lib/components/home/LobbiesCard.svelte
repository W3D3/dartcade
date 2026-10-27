<script lang="ts">
  // Friends' lobbies (Home board): lobbies your friends host, open ones with a Join and running ones
  // for show (Watch does not exist yet). Reloads when the friends list changes over /ws/me.
  import { Users } from '@lucide/svelte'
  import { Button } from '$lib/components/ui/button/index.js'
  import ErrorText from '$lib/components/ErrorText.svelte'
  import SwitchLobbyConfirm from '$lib/components/lobby/SwitchLobbyConfirm.svelte'
  import HomeSection from './HomeSection.svelte'
  import { api } from '$lib/api'
  import { createFriendActions } from '$lib/friends/controller.svelte'
  import { Loader } from '$lib/home/loader.svelte'
  import { lobbyLine } from '$lib/home/view'
  import { me } from '$lib/lobby/sockets'

  const lobbies = new Loader(() => api.GET('/api/home/lobbies'))
  const actions = createFriendActions(() => $me?.lobby?.id ?? null)

  // A new friends list is someone coming, going or opening a lobby. /ws/me also pushes invites, lobby
  // and game changes: those leave the friends list as it was.
  let seen = $me?.friends
  $effect(() => {
    const friends = $me?.friends
    if (!friends || friends === seen) return
    seen = friends
    void lobbies.load()
  })
</script>

<HomeSection title="Friends' lobbies" link={{ label: 'All friends', href: '#/friends' }} loading={lobbies.loading} error={lobbies.error}>
  {#if lobbies.data && lobbies.data.lobbies.length > 0}
    <ul class="m-0 flex list-none flex-col gap-[10px] p-0">
      {#each lobbies.data.lobbies as lobby (lobby.id)}
        <li class="flex items-center gap-3">
          <span class="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-1 text-text-muted" aria-hidden="true"
            ><Users size={18} /></span
          >
          <span class="flex min-w-0 flex-1 flex-col">
            <span class="flex items-center gap-2">
              <span class="truncate text-[15px] font-semibold">{lobby.name}</span>
              <span
                class="inline-flex shrink-0 items-center gap-[6px] text-[12px] {lobby.state === 'open' ? 'text-accent' : 'text-text-muted'}"
              >
                <span class="size-[6px] rounded-full {lobby.state === 'open' ? 'bg-accent' : 'bg-text-dim'}" aria-hidden="true"></span>
                {lobby.state === 'open' ? 'Open' : 'In game'}
              </span>
            </span>
            <span class="truncate text-[13px] text-text-muted">{lobbyLine(lobby)}</span>
          </span>
          {#if lobby.state === 'open'}
            <Button
              variant="outline"
              size="sm"
              disabled={actions.busy}
              aria-label="Join {lobby.name}"
              onclick={() => void actions.joinLobby(lobby.id, lobby.name)}>Join</Button
            >
          {/if}
        </li>
      {/each}
    </ul>
    <p class="m-0 text-[12px] text-text-dim">Open lobbies let friends drop in.</p>
  {:else}
    <p class="m-0 text-[14px] text-text-muted">No friends' lobbies right now.</p>
  {/if}
  {#if actions.error}<ErrorText>{actions.error}</ErrorText>{/if}
</HomeSection>

{#if actions.switching}
  {@const s = actions.switching}
  <SwitchLobbyConfirm
    from={$me?.lobby?.name ?? 'your lobby'}
    to={s.lobbyName}
    onconfirm={() => void actions.leaveAndJoin()}
    oncancel={actions.stopSwitch}
  />
{/if}
