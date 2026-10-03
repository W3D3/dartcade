<script lang="ts">
  // The lobby: who's in, on which boards, the next game, the history. It all comes from the
  // lobby socket; changes go through the REST API and come back on the socket.
  import { onDestroy, onMount } from 'svelte'
  import { push } from 'svelte-spa-router'
  import Layout from '$lib/components/Layout.svelte'
  import { Button } from '$lib/components/ui/button/index.js'
  import ErrorText from '$lib/components/ErrorText.svelte'
  import EmptyState from '$lib/components/lobby/EmptyState.svelte'
  import LobbyHeader from '$lib/components/lobby/LobbyHeader.svelte'
  import PeopleList from '$lib/components/lobby/PeopleList.svelte'
  import ActivityFeed from '$lib/components/lobby/ActivityFeed.svelte'
  import BoardChip from '$lib/components/lobby/BoardChip.svelte'
  import PersonControls from '$lib/components/lobby/PersonControls.svelte'
  import AddSomeone from '$lib/components/lobby/AddSomeone.svelte'
  import GameRunningBar from '$lib/components/lobby/GameRunningBar.svelte'
  import NextGameCard from '$lib/components/lobby/NextGameCard.svelte'
  import MemberPanel from '$lib/components/lobby/MemberPanel.svelte'
  import StartAnywayConfirm from '$lib/components/lobby/StartAnywayConfirm.svelte'
  import { api } from '$lib/api'
  import type { Lobby, LobbyPerson } from '$lib/api/lobby-ws'
  import { currentUser } from '$lib/auth'
  import { describeConflict, type Refusal } from '$lib/lobby/input'
  import { boardChoices, isHost, myRow, playsInGame, type LobbyPatch, type OwnBoard, type PersonPatch } from '$lib/lobby/rules'
  import { shouldOpenGame, startGame } from '$lib/lobby/start'
  import { createLobby } from '$lib/lobby/create'
  import { createLobbyStore, type LobbyEnd } from '$lib/lobby/sockets'

  let lobby = $state<Lobby | null>(null)
  let ended = $state<LobbyEnd | null>(null)
  let phase = $state<'loading' | 'none' | 'open'>('loading')
  let ownBoards = $state<OwnBoard[]>([])
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
    ownBoards = (boards.data?.boards ?? []).map(b => ({ id: b.id, name: b.name }))
    if (cur.data) open(cur.data.id)
    else phase = 'none'
  }

  /** Runs a change; a refusal shows above the lists. Resolves true when it went through. */
  async function act(run: () => Promise<{ error?: Refusal }>): Promise<boolean> {
    const { error: refusal } = await run()
    error = refusal ? describeConflict(refusal) : ''
    runningSessionId = null
    return !refusal
  }
  function withLobby(run: (id: string) => Promise<{ error?: Refusal }>): Promise<boolean> {
    const id = lobby?.id
    return id ? act(() => run(id)) : Promise.resolve(false)
  }

  async function create() {
    const created = await createLobby()
    if (created.ok) { error = ''; open(created.lobbyId) }
    else error = created.message
  }
  const rename = (name: string) => withLobby(id => api.PATCH('/api/lobbies/{id}', { params: { path: { id } }, body: { name } }))
  const newCode = () => withLobby(id => api.PATCH('/api/lobbies/{id}', { params: { path: { id } }, body: { regenerateCode: true } }))
  const close = () => withLobby(id => api.POST('/api/lobbies/{id}/close', { params: { path: { id } } }))
  async function leave() {
    if (await withLobby(id => api.POST('/api/lobbies/{id}/leave', { params: { path: { id } } }))) void push('/')
  }
  const updatePerson = (personId: string, patch: PersonPatch) =>
    withLobby(id => api.PATCH('/api/lobbies/{id}/people/{personId}', { params: { path: { id, personId } }, body: patch }))
  const removePerson = (personId: string) =>
    withLobby(id => api.DELETE('/api/lobbies/{id}/people/{personId}', { params: { path: { id, personId } } }))
  const addGuest = (name: string) =>
    withLobby(id => api.POST('/api/lobbies/{id}/people', { params: { path: { id } }, body: { name } }))
  const invite = (userId: string) =>
    withLobby(id => api.POST('/api/lobbies/{id}/invites', { params: { path: { id } }, body: { userId } }))
  const updateLobby = (patch: LobbyPatch) =>
    withLobby(id => api.PATCH('/api/lobbies/{id}', { params: { path: { id } }, body: patch }))

  // Going to the game: once per game, for whoever has a seat in it (decision 7)
  let seenSession: string | null | undefined = undefined
  let opened: string | null = null
  function openGame(sessionId: string) {
    if (opened === sessionId) return
    opened = sessionId
    void push(`/session/${sessionId}`)
  }
  $effect(() => {
    if (!lobby) return
    const next = lobby.currentSessionId
    if (next !== null && shouldOpenGame(seenSession, next, playsInGame(lobby, viewerId))) openGame(next)
    seenSession = next
  })

  // Start or Rematch; people who aren't ready get named and the host can start anyway
  let confirmStart = $state<{ names: string[]; rematch: boolean } | null>(null)
  // A start in flight: Start and Rematch wait for it, so a double click sends one
  let starting = $state(false)
  // Your own game that's running elsewhere, when a start was refused for it
  let runningSessionId = $state<string | null>(null)
  async function start(rematch: boolean, force = false) {
    const id = lobby?.id
    if (!id || starting) return
    starting = true
    runningSessionId = null
    try {
      const outcome = await startGame(id, { rematch, force })
      if (outcome.kind === 'started') { error = ''; openGame(outcome.sessionId) }
      else if (outcome.kind === 'confirm') confirmStart = { names: outcome.notReady, rematch }
      else { error = outcome.message; runningSessionId = outcome.sessionId }
    } finally { starting = false }
  }
  const host = $derived(lobby !== null && isHost(lobby, viewerId))
  const mine = $derived(lobby ? myRow(lobby, viewerId) : null)

  onMount(() => { void load() })
  onDestroy(() => { destroyed = true; socket?.destroy(); unsubs.forEach(u => u()) })
</script>

{#snippet startOrJoin()}
  <Button variant="accent" onclick={() => void create()}>Create lobby</Button>
  <Button variant="outline" href="#/join" class="h-11">Join with a code</Button>
{/snippet}

{#snippet errorBanner()}
  {#if error}
    <span class="flex flex-wrap items-center gap-3">
      <ErrorText>{error}</ErrorText>
      {#if runningSessionId}<Button variant="outline" href="#/session/{runningSessionId}" class="h-9 px-3 text-[13px]">Return to game</Button>{/if}
    </span>
  {/if}
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
      {@const l = lobby}
      <LobbyHeader {lobby} {viewerId} onrename={rename} onnewcode={() => void newCode()} onclose={() => void close()} onleave={() => void leave()} />
      {@render errorBanner()}
      <div class="flex flex-col gap-4 md:grid md:grid-cols-[minmax(0,580px)_minmax(0,1fr)] md:gap-5 md:flex-grow md:min-h-0">
        <div class="order-2 md:order-none flex flex-col min-w-0 md:min-h-0">
          <PeopleList {lobby} {viewerId}>
            {#snippet boardOf(p: LobbyPerson)}
              <BoardChip person={p} choices={boardChoices(p, viewerId, ownBoards)} onpick={(boardId: string | null) => void updatePerson(p.id, { boardId })} />
            {/snippet}
            {#snippet controlsOf(p: LobbyPerson, i: number)}
              <PersonControls lobby={l} person={p} index={i} {viewerId} onupdate={updatePerson} onremove={removePerson} />
            {/snippet}
            {#snippet footer()}<AddSomeone exclude={[...l.people.flatMap(p => (p.userId ? [p.userId] : [])), ...l.invites.map(i => i.userId)]} onguest={addGuest} oninvite={invite} />{/snippet}
          </PeopleList>
        </div>
        <div class="order-1 md:order-none flex flex-col gap-4 md:gap-5 min-w-0 md:min-h-0">
          {#if l.currentSessionId}
            <GameRunningBar sessionId={l.currentSessionId} playing={playsInGame(l, viewerId)} />
          {/if}
          {#if host}
            <NextGameCard lobby={l} onupdate={updateLobby} onplays={(personId: string, plays: boolean) => updatePerson(personId, { plays })}
              busy={starting} onstart={(rematch: boolean) => void start(rematch)} />
          {:else if mine}
            <MemberPanel lobby={l} me={mine} onupdate={updatePerson} />
          {/if}
          <div class="hidden md:flex md:flex-col md:min-h-0"><ActivityFeed activity={lobby.activity} {viewerId} since={lobby.createdAt} /></div>
        </div>
        <div class="order-3 md:hidden"><ActivityFeed activity={lobby.activity} {viewerId} since={lobby.createdAt} /></div>
      </div>
    {:else}
      <p class="m-0 text-[15px] text-text-muted">Loading the lobby…</p>
    {/if}
  </main>
</Layout>

{#if confirmStart}
  {@const cs = confirmStart}
  <StartAnywayConfirm names={cs.names}
    onconfirm={() => { const { rematch } = cs; confirmStart = null; void start(rematch, true) }} oncancel={() => confirmStart = null} />
{/if}
