<script lang="ts">
  // Friends (Friends, Tablet-Friends and Friends-Phone boards): your friends and what they do,
  // live from /ws/me, requests, and adding a friend by name. Tablets and desktops have tabs and a
  // right-hand column (below the list on narrow tablets); phones stack everything (add, requests,
  // online, offline) without tabs.
  import { onMount } from 'svelte'
  import { push } from 'svelte-spa-router'
  import { UsersRound } from '@lucide/svelte'
  import Layout from '$lib/components/Layout.svelte'
  import ErrorText from '$lib/components/ErrorText.svelte'
  import EmptyState from '$lib/components/lobby/EmptyState.svelte'
  import SwitchLobbyConfirm from '$lib/components/lobby/SwitchLobbyConfirm.svelte'
  import AddFriendCard from '$lib/components/friends/AddFriendCard.svelte'
  import FriendsSection from '$lib/components/friends/FriendsSection.svelte'
  import FriendsTabs from '$lib/components/friends/FriendsTabs.svelte'
  import InvisibleBanner from '$lib/components/friends/InvisibleBanner.svelte'
  import RequestsPanel from '$lib/components/friends/RequestsPanel.svelte'
  import StatusCard from '$lib/components/friends/StatusCard.svelte'
  import type { Friend } from '$lib/api/lobby-ws'
  import { api } from '$lib/api'
  import { currentUser } from '$lib/auth'
  import { me } from '$lib/lobby/sockets'
  import { answerRequest, cancelRequest, inviteFriend, joinFriend, removeFriend } from '$lib/friends/actions'
  import { setInvisible } from '$lib/presence'
  import { friendsTabId, splitOnline, tabCounts, type FriendsTab } from '$lib/friends/view'

  const invisible = $derived($currentUser?.invisible ?? false)
  const list = $derived($me?.friends ?? { friends: [], incoming: [], outgoing: [] })
  const loaded = $derived($me?.friends != null)
  const groups = $derived(splitOnline(list.friends))
  const counts = $derived(tabCounts(list))
  const myLobbyId = $derived($me?.lobby?.id ?? null)
  const noRequests = $derived(list.incoming.length === 0 && list.outgoing.length === 0)
  let tab = $state<FriendsTab>('all')
  // A refused action (a Join the row was too old for, say); the row itself updates from the next push
  let error = $state('')
  let busy = $state(false)
  let switching = $state<{ lobbyId: string; lobbyName: string; from: string } | null>(null)
  // Ticks so "10 min ago" ages while the page is open
  let now = $state(new Date())
  onMount(() => {
    const tick = setInterval(() => {
      now = new Date()
    }, 30_000)
    return () => {
      clearInterval(tick)
    }
  })

  async function once(run: () => Promise<string | null>): Promise<string | null> {
    if (busy) return null
    busy = true
    try {
      const err = await run()
      error = err ?? ''
      return err
    } finally {
      busy = false
    }
  }

  const invite = (f: Friend) => once(() => (myLobbyId ? inviteFriend(myLobbyId, f.id) : Promise.resolve(null)))
  const remove = (f: Friend) => once(() => removeFriend(f.id))
  const answer = (id: string, a: 'accept' | 'decline') => once(() => answerRequest(id, a))
  const cancel = (id: string) => once(() => cancelRequest(id))

  async function join(lobbyId: string, lobbyName: string): Promise<string | null> {
    const r = await joinFriend(lobbyId)
    if (r.kind === 'joined') {
      void push('/lobby')
      return null
    }
    if (r.kind === 'switch') {
      switching = { lobbyId, lobbyName, from: r.from }
      return null
    }
    return r.text
  }
  const joinFriendOf = (f: Friend) =>
    once(() => (f.status.kind === 'lobby' ? join(f.status.lobbyId, f.status.lobbyName) : Promise.resolve(null)))

  function leaveAndJoin() {
    const s = switching
    switching = null
    if (!s) return
    return once(async () => {
      const left = await api.POST('/api/lobbies/{id}/leave', { params: { path: { id: s.from } } })
      // 404: we'd already left it; anything else, stop rather than ask again
      if (left.error && left.response.status !== 404) return left.error.error
      return join(s.lobbyId, s.lobbyName)
    })
  }

  const rowHandlers = {
    oninvite: (f: Friend) => void invite(f),
    onjoin: (f: Friend) => void joinFriendOf(f),
    onremove: (f: Friend) => void remove(f),
  }
</script>

{#snippet onlineCount()}<span class="pr-1 text-[13px] text-text-muted whitespace-nowrap">{counts.online} online</span>{/snippet}

<Layout title="Friends" headerAction={onlineCount}>
  <main
    class="flex flex-grow flex-col gap-[14px] md:gap-[22px] box-border min-w-0 overflow-y-auto px-4 pt-[14px] pb-5 md:px-[30px] md:py-7 xl:px-11 xl:py-10"
  >
    <header class="hidden md:flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
      <div class="flex flex-col gap-[6px]">
        <h1 class="m-0 font-display font-bold text-[42px] xl:text-[48px] leading-none uppercase tracking-[0.02em]">Friends</h1>
        <p class="m-0 text-[15px] text-text-muted">
          <strong class="text-text font-semibold">{counts.online} online</strong> · {counts.all}
          {counts.all === 1 ? 'friend' : 'friends'} <span class="hidden xl:inline">· invite them to your lobby from here.</span>
        </p>
      </div>
      <FriendsTabs bind:tab {counts} panelId="friends-panel" />
    </header>
    {#if invisible}<InvisibleBanner ongoonline={() => void once(() => setInvisible(false))} />{/if}
    {#if error}<ErrorText>{error}</ErrorText>{/if}

    <div
      class="flex flex-col gap-[14px] md:gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_380px] lg:items-start"
    >
      <div
        id="friends-panel"
        role="tabpanel"
        aria-labelledby={friendsTabId(tab)}
        class="order-2 lg:order-none flex flex-col gap-[14px] md:gap-5 min-w-0"
      >
        {#if loaded && list.friends.length === 0}
          <div class={tab === 'requests' ? 'md:hidden' : ''}>
            <EmptyState
              title="No friends yet"
              text="Add a friend by their name. Once they accept, you see each other's status and can join each other's lobbies."
            >
              {#snippet icon()}<UsersRound size={24} />{/snippet}
            </EmptyState>
          </div>
        {:else}
          {#if tab === 'online' && groups.online.length === 0}
            <p class="hidden md:block m-0 text-[15px] text-text-muted">Nobody's online right now.</p>
          {/if}
          <FriendsSection
            title="Online"
            friends={groups.online}
            inALobby={myLobbyId !== null}
            {busy}
            {...rowHandlers}
            class={tab === 'requests' ? 'md:hidden' : ''}
          />
          <FriendsSection
            title="Offline"
            friends={groups.offline}
            inALobby={myLobbyId !== null}
            {busy}
            {...rowHandlers}
            class={tab === 'all' ? '' : 'md:hidden'}
          />
        {/if}
        {#if tab === 'requests'}
          <div class="hidden md:block">
            <RequestsPanel
              incoming={list.incoming}
              outgoing={list.outgoing}
              {now}
              emptyText="No open requests."
              {busy}
              onanswer={answer}
              oncancel={cancel}
            />
          </div>
        {/if}
      </div>

      <aside class="order-1 lg:order-none flex flex-col gap-[14px] md:gap-4 min-w-0">
        <!-- Phones (Friends-Phone.dc.html): Your status first. Tablets/desktops (Friends.dc.html,
             Tablet-Friends.dc.html): Add a friend, then Friend requests, then Your status last. -->
        <div class="order-first md:order-last">
          <StatusCard {invisible} onchange={(v: boolean) => once(() => setInvisible(v))} />
        </div>
        <AddFriendCard />
        <section
          aria-label="Friend requests"
          class="flex flex-col gap-[6px] md:gap-[10px] md:box-border md:p-[18px] md:rounded-[14px] md:bg-surface-panel md:border md:border-line-2 {noRequests
            ? 'max-md:hidden'
            : ''}"
        >
          <div class="flex items-baseline justify-between gap-3">
            <h2
              class="m-0 text-[12px] font-semibold uppercase tracking-[0.1em] text-text-muted md:text-[15px] md:normal-case md:tracking-normal md:text-text"
            >
              Requests<span class="md:hidden">{` · ${list.incoming.length} for you · ${list.outgoing.length} sent`}</span>
            </h2>
            <span class="hidden md:inline text-[12px] text-text-dim">{list.incoming.length} for you · {list.outgoing.length} sent</span>
          </div>
          <RequestsPanel
            incoming={list.incoming}
            outgoing={list.outgoing}
            {now}
            headings={false}
            emptyText="No requests for you right now."
            {busy}
            onanswer={answer}
            oncancel={cancel}
          />
        </section>
      </aside>
    </div>
  </main>
</Layout>

{#if switching}
  {@const s = switching}
  <SwitchLobbyConfirm
    from={$me?.lobby?.name ?? 'your lobby'}
    to={s.lobbyName}
    onconfirm={() => void leaveAndJoin()}
    oncancel={() => (switching = null)}
  />
{/if}
