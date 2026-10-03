<script lang="ts">
  // The lobby: who's in, on which boards, the next game, the history. It all comes from the
  // lobby socket; changes go through the REST API and come back on the socket.
  import { onDestroy, onMount } from 'svelte'
  import { push } from 'svelte-spa-router'
  import Layout from '$lib/components/Layout.svelte'
  import { Button } from '$lib/components/ui/button/index.js'
  import EmptyState from '$lib/components/lobby/EmptyState.svelte'
  import LobbyHeader from '$lib/components/lobby/LobbyHeader.svelte'
  import PeopleList from '$lib/components/lobby/PeopleList.svelte'
  import ActivityFeed from '$lib/components/lobby/ActivityFeed.svelte'
  import { api } from '$lib/api'
  import type { Lobby } from '$lib/api/lobby-ws'
  import { currentUser } from '$lib/auth'
  import { describeConflict, type Refusal } from '$lib/lobby/input'
  import type { OwnBoard } from '$lib/lobby/rules'
  import { createLobbyStore, type LobbyEnd } from '$lib/lobby/sockets'

  let lobby = $state<Lobby | null>(null)
  let ended = $state<LobbyEnd | null>(null)
  let phase = $state<'loading' | 'none' | 'open'>('loading')
  // Unused until Task 9 wires board switching into the people list (leading underscore: deliberately unused).
  let _ownBoards = $state<OwnBoard[]>([])
  let error = $state('')
  let socket: ReturnType<typeof createLobbyStore> | null = null
  let unsubs: (() => void)[] = []
  let destroyed = false
  const viewerId = $derived($currentUser?.id ?? null)

  function open(lobbyId: string) {
    if (destroyed) return
    socket?.destroy()
    unsubs.forEach(u => u())
    lobby = null
    ended = null
    socket = createLobbyStore(lobbyId)
    unsubs = [socket.lobby.subscribe(l => { lobby = l }), socket.ended.subscribe(e => { ended = e })]
    phase = 'open'
  }

  async function load() {
    const [cur, boards] = await Promise.all([api.GET('/api/lobbies/current'), api.GET('/api/boards')])
    _ownBoards = (boards.data?.boards ?? []).map(b => ({ id: b.id, name: b.name }))
    if (cur.data) open(cur.data.id)
    else phase = 'none'
  }

  /** Runs a change; a refusal shows above the lists. Resolves true when it went through. */
  async function act(run: () => Promise<{ error?: Refusal }>): Promise<boolean> {
    const { error: refusal } = await run()
    error = refusal ? describeConflict(refusal) : ''
    return !refusal
  }
  function withLobby(run: (id: string) => Promise<{ error?: Refusal }>): Promise<boolean> {
    const id = lobby?.id
    return id ? act(() => run(id)) : Promise.resolve(false)
  }

  async function create() {
    const res = await api.POST('/api/lobbies')
    if (res.data) { error = ''; open(res.data.id) }
    else error = describeConflict(res.error)
  }
  const rename = (name: string) => withLobby(id => api.PATCH('/api/lobbies/{id}', { params: { path: { id } }, body: { name } }))
  const newCode = () => withLobby(id => api.PATCH('/api/lobbies/{id}', { params: { path: { id } }, body: { regenerateCode: true } }))
  const close = () => withLobby(id => api.POST('/api/lobbies/{id}/close', { params: { path: { id } } }))
  async function leave() {
    if (await withLobby(id => api.POST('/api/lobbies/{id}/leave', { params: { path: { id } } }))) void push('/')
  }

  onMount(() => { void load() })
  onDestroy(() => { destroyed = true; socket?.destroy(); unsubs.forEach(u => u()) })
</script>

{#snippet startOrJoin()}
  <Button variant="accent" onclick={() => void create()}>Create lobby</Button>
  <Button variant="outline" href="#/join" class="h-11">Join with a code</Button>
{/snippet}

{#snippet errorBanner()}
  {#if error}<p role="alert" class="m-0 text-[14px] text-live-text">{error}</p>{/if}
{/snippet}

<Layout title="Lobby">
  <main class="flex flex-grow flex-col gap-4 md:gap-[22px] box-border min-w-0 overflow-y-auto p-4 md:px-11 md:py-8">
    {#if ended}
      <EmptyState title={ended === 'closed' ? 'The lobby was closed' : "You're no longer in the lobby"}
        text="Start a new lobby, join one with a code, or play a game of your own." actions={startOrJoin} />
    {:else if phase === 'none'}
      <EmptyState title="You're not in a lobby"
        text="A lobby keeps your crew together between games: everyone joins once, on their own board or phone."
        actions={startOrJoin} />
      {@render errorBanner()}
    {:else if lobby}
      <LobbyHeader {lobby} {viewerId} onrename={rename} onnewcode={() => void newCode()} onclose={() => void close()} onleave={() => void leave()} />
      {@render errorBanner()}
      <div class="flex flex-col gap-4 md:grid md:grid-cols-[minmax(0,580px)_minmax(0,1fr)] md:gap-5 md:flex-grow md:min-h-0">
        <div class="order-2 md:order-none flex flex-col min-w-0 md:min-h-0">
          <PeopleList {lobby} {viewerId} />
        </div>
        <div class="order-1 md:order-none flex flex-col gap-4 md:gap-5 min-w-0 md:min-h-0">
          <!-- Task 10: the running-game bar and the next game go here -->
          <div class="hidden md:flex md:flex-col md:min-h-0"><ActivityFeed activity={lobby.activity} {viewerId} since={lobby.createdAt} /></div>
        </div>
        <div class="order-3 md:hidden"><ActivityFeed activity={lobby.activity} {viewerId} since={lobby.createdAt} /></div>
      </div>
    {:else}
      <p class="m-0 text-[15px] text-text-muted">Loading the lobby…</p>
    {/if}
  </main>
</Layout>
