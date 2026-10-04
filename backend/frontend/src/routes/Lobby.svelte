<script lang="ts">
  // The lobby: who's in, on which boards, the next game, the history. It all comes from the
  // lobby socket; changes go through the REST API and come back on the socket.
  import { onDestroy, onMount } from 'svelte'
  import { push, querystring, replace } from 'svelte-spa-router'
  import Layout from '$lib/components/Layout.svelte'
  import { Button } from '$lib/components/ui/button/index.js'
  import ErrorText from '$lib/components/ErrorText.svelte'
  import EmptyState from '$lib/components/lobby/EmptyState.svelte'
  import LobbyHeader from '$lib/components/lobby/LobbyHeader.svelte'
  import LobbyPeople from '$lib/components/lobby/LobbyPeople.svelte'
  import ActivityFeed from '$lib/components/lobby/ActivityFeed.svelte'
  import GameRunningBar from '$lib/components/lobby/GameRunningBar.svelte'
  import InviteFriendsPanel from '$lib/components/lobby/InviteFriendsPanel.svelte'
  import NextGameCard from '$lib/components/lobby/NextGameCard.svelte'
  import MemberPanel from '$lib/components/lobby/MemberPanel.svelte'
  import StartProblemDialog from '$lib/components/lobby/StartProblemDialog.svelte'
  import { api } from '$lib/api'
  import type { Lobby, TeamId } from '$lib/api/lobby-ws'
  import { currentUser } from '$lib/auth'
  import { describeConflict, type Refusal } from '$lib/lobby/input'
  import { isHost, myRow, playsInGame, type LobbyPatch, type OwnBoard, type PersonPatch } from '$lib/lobby/rules'
  import { shouldOpenGame, startGame, type StartOutcome } from '$lib/lobby/start'
  import { createLobby } from '$lib/lobby/create'
  import { lobbyActions, type LobbyActions } from '$lib/lobby/actions'
  import { boardToApply } from '$lib/lobby/play'
  import { createLobbyStore, type LobbyEnd } from '$lib/lobby/sockets'

  let lobby = $state<Lobby | null>(null)
  let ended = $state<LobbyEnd | null>(null)
  // failed: the lobby couldn't be loaded (not a 404, which is "not in a lobby")
  let phase = $state<'loading' | 'none' | 'open' | 'failed'>('loading')
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
    phase = 'loading'
    try {
      const [cur, boards] = await Promise.all([api.GET('/api/lobbies/current'), api.GET('/api/boards')])
      ownBoards = (boards.data?.boards ?? []).map(b => ({ id: b.id, name: b.name }))
      if (cur.data) open(cur.data.id)
      else phase = cur.response.status === 404 ? 'none' : 'failed'
    } catch {
      phase = 'failed'
    }
  }

  /** Runs a change; a refusal shows above the lists. Resolves true when it went through. */
  async function act(run: () => Promise<{ error?: Refusal }>): Promise<boolean> {
    const { error: refusal } = await run()
    error = refusal ? describeConflict(refusal) : ''
    return !refusal
  }
  function withLobby(run: (actions: LobbyActions, id: string) => Promise<{ error?: Refusal }>): Promise<boolean> {
    const id = lobby?.id
    return id ? act(() => run(lobbyActions(id), id)) : Promise.resolve(false)
  }

  async function create() {
    const created = await createLobby()
    if (created.ok) { error = ''; open(created.lobbyId) }
    else error = created.message
  }
  const updateLobby = (patch: LobbyPatch) => withLobby(a => a.updateLobby(patch))
  const rename = (name: string) => updateLobby({ name })
  const newCode = () => updateLobby({ regenerateCode: true })
  const close = () => withLobby((_, id) => api.POST('/api/lobbies/{id}/close', { params: { path: { id } } }))
  async function leave() {
    if (await withLobby((_, id) => api.POST('/api/lobbies/{id}/leave', { params: { path: { id } } }))) void push('/')
  }
  const updatePerson = (personId: string, patch: PersonPatch) => withLobby(a => a.updatePerson(personId, patch))
  const removePerson = (personId: string) => withLobby(a => a.removePerson(personId))
  const addGuest = (name: string) => withLobby(a => a.addGuest(name))
  const invite = (userId: string) => withLobby(a => a.invite(userId))
  const setTeam = (personId: string, team: TeamId) => withLobby(a => a.setTeam(personId, team))
  const shuffleTeams = () => withLobby(a => a.shuffleTeams())

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

  // A start problem shows in a dialog instead of the error line (see StartProblemDialog)
  let startProblem = $state<Extract<StartOutcome, { kind: 'problem' }> | null>(null)
  // A start in flight: Start waits for it, so a double click sends one
  let starting = $state(false)
  async function start(force = false) {
    const id = lobby?.id
    if (!id || starting) return
    starting = true
    try {
      const outcome = await startGame(id, { force })
      if (outcome.kind === 'started') { error = ''; startProblem = null; openGame(outcome.sessionId) }
      else startProblem = outcome
    } finally { starting = false }
  }
  const host = $derived(lobby !== null && isHost(lobby, viewerId))
  const mine = $derived(lobby ? myRow(lobby, viewerId) : null)

  // "Play on this board" (Boards page, then New game): move your row to that board once your
  // row and boards are known. Plain, not state: the effect clears it once it's handled, and
  // drops it from the URL so a reload doesn't move you again.
  let boardFromLink = new URLSearchParams($querystring ?? '').get('board')
  const myRowId = $derived(mine?.id ?? null)
  const myBoardId = $derived(mine?.boardId ?? null)
  $effect(() => {
    const personId = myRowId, current = myBoardId
    if (!boardFromLink || !personId) return
    const target = boardToApply(boardFromLink, current, ownBoards)
    boardFromLink = null
    void replace('/lobby')
    if (target) void updatePerson(personId, { boardId: target })
  })

  onMount(() => { void load() })
  onDestroy(() => { destroyed = true; socket?.destroy(); unsubs.forEach(u => u()) })
</script>

{#snippet startOrJoin()}
  <Button variant="accent" onclick={() => void create()}>Create lobby</Button>
  <Button variant="outline" size="md" href="#/join">Join with a code</Button>
{/snippet}

{#snippet errorBanner()}
  {#if error}
    <ErrorText>{error}</ErrorText>
  {/if}
{/snippet}

<Layout title="Lobby">
  <main class="flex flex-grow flex-col gap-4 md:gap-[22px] box-border min-w-0 overflow-y-auto p-4 md:px-8 xl:px-11 md:py-8">
    {#if ended}
      <EmptyState title={ended === 'closed' ? 'The lobby was closed' : "You're no longer in the lobby"}
        text="Start a new lobby, join one with a code, or play a game of your own." actions={startOrJoin} />
    {:else if phase === 'failed'}
      <div class="flex flex-col items-start gap-3">
        <ErrorText>Couldn't load the lobby.</ErrorText>
        <Button variant="outline" size="md" onclick={() => void load()}>Try again</Button>
      </div>
    {:else if phase === 'none'}
      <EmptyState title="You're not in a lobby"
        text="A lobby keeps your crew together between games: everyone joins once, on their own board or phone."
        actions={startOrJoin} />
      {@render errorBanner()}
    {:else if lobby}
      {@const l = lobby}
      <LobbyHeader {lobby} {viewerId} onrename={rename} onnewcode={() => void newCode()} onclose={() => void close()} onleave={() => void leave()} />
      {@render errorBanner()}
      <!-- Solo: no history, and Invite friends leads; the people list (add field included) shows either way.
           Two columns from lg (tablets: the next game in a 420 px column); one below, as on phones -->
      <div class="flex flex-col gap-4 md:gap-5 lg:grid lg:grid-cols-[minmax(0,1fr)_420px] xl:grid-cols-[minmax(0,580px)_minmax(0,1fr)] lg:flex-grow lg:min-h-0">
        <div class="order-2 lg:order-none flex flex-col min-w-0 lg:min-h-0">
          <LobbyPeople lobby={l} {viewerId} {ownBoards} onupdate={updatePerson} onremove={removePerson} onguest={addGuest} oninvite={invite} />
        </div>
        <div class="order-1 lg:order-none flex flex-col gap-4 md:gap-5 min-w-0 lg:min-h-0">
          {#if l.solo}<InviteFriendsPanel lobby={l} onnewcode={() => void newCode()} />{/if}
          {#if l.currentSessionId}
            <GameRunningBar sessionId={l.currentSessionId} playing={playsInGame(l, viewerId)} />
          {/if}
          {#if host}
            <NextGameCard lobby={l} onupdate={updateLobby} onplays={(personId: string, plays: boolean) => updatePerson(personId, { plays })}
              onteammove={setTeam} onteamplace={updatePerson} onteamshuffle={shuffleTeams}
              busy={starting} onstart={() => void start()} />
          {:else if mine}
            <MemberPanel lobby={l} me={mine} onupdate={updatePerson} />
          {/if}
          {#if !l.solo}
            <div class="hidden lg:flex lg:flex-col lg:min-h-0"><ActivityFeed activity={l.activity} {viewerId} since={l.createdAt} /></div>
          {/if}
        </div>
        {#if !l.solo}
          <div class="order-3 lg:hidden"><ActivityFeed activity={l.activity} {viewerId} since={l.createdAt} /></div>
        {/if}
      </div>
    {:else}
      <p class="m-0 text-[15px] text-text-muted">Loading the lobby…</p>
    {/if}
  </main>
</Layout>

{#if startProblem}
  <StartProblemDialog problem={startProblem}
    onstartanyway={() => { startProblem = null; void start(true) }} onback={() => startProblem = null} />
{/if}
