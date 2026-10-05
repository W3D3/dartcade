<script lang="ts">
  // Joining a lobby by its code: typed, or from a join link or QR code (#/join/K7Q4MD). It shows
  // which lobby the code opens first; someone in another lobby can leave it first.
  import { untrack } from 'svelte'
  import { push } from 'svelte-spa-router'
  import Layout from '$lib/components/Layout.svelte'
  import ErrorText from '$lib/components/ErrorText.svelte'
  import { Button } from '$lib/components/ui/button/index.js'
  import LobbyPreviewCard from '$lib/components/lobby/LobbyPreviewCard.svelte'
  import SwitchLobbyConfirm from '$lib/components/lobby/SwitchLobbyConfirm.svelte'
  import { api } from '$lib/api'
  import { currentUser, signOut } from '$lib/auth'
  import { formatCode } from '$lib/lobby/format'
  import { describeConflict, normalizeCode, type Refusal } from '$lib/lobby/input'
  import { me } from '$lib/lobby/sockets'
  import { rememberReturn, sessionStore } from '$lib/returnTo'

  type Preview = { id: string; name: string; hostName: string | null; peopleCount: number; boardNames: string[] }
  let { params = {} }: { params?: { code?: string } } = $props()

  // Filled from the link; typing changes it from there, and another link fills that one in
  const fromLink = (c: string | undefined) => formatCode(normalizeCode(c ?? ''))
  let text = $state(untrack(() => fromLink(params.code)))
  let linkCode = untrack(() => params.code)
  $effect(() => {
    const c = params.code
    if (c === linkCode) return
    linkCode = c
    if (c) text = fromLink(c)
  })
  const code = $derived(normalizeCode(text))
  let preview = $state<Preview | null>(null)
  // No open lobby has the code (a 404), or the check itself failed
  let missing = $state(false)
  let failed = $state(false)
  let error = $state('')
  let busy = $state(false)
  let leaveFirst = $state<string | null>(null)
  // Your game is running: finish or end it before joining
  let runningSessionId = $state<string | null>(null)
  const you = $derived($currentUser?.name ?? 'you')

  /** Looks the code up; again from "Try again" after a failed check. */
  function check(c: string) {
    preview = null
    missing = false
    failed = false
    if (c.length !== 6) return
    api
      .GET('/api/lobby-codes/{code}', { params: { path: { code: c } } })
      .then(({ data, response }) => {
        if (code !== c) return
        preview = data ?? null
        if (!data) {
          if (response.status === 404 || response.ok) missing = true
          else failed = true
        }
      })
      .catch(() => {
        if (code === c) failed = true
      })
  }
  $effect(() => {
    check(code)
  })

  async function join() {
    if (!preview) return
    busy = true
    error = ''
    runningSessionId = null
    try {
      const res = await api.POST('/api/lobbies/{id}/join', { params: { path: { id: preview.id } }, body: { code } })
      if (res.data) {
        void push('/lobby')
        return
      }
      const r: Refusal = res.error
      if (r.code === 'in_lobby' && r.lobbyId && r.lobbyId !== preview.id) leaveFirst = r.lobbyId
      else {
        error = describeConflict(r)
        if (r.code === 'active_session' && r.sessionId) runningSessionId = r.sessionId
      }
    } finally {
      busy = false
    }
  }

  /** Signs out; signing in as someone else comes back here with the code. */
  function switchAccount() {
    rememberReturn(sessionStore(), code.length === 6 ? `#/join/${code}` : '#/join')
    void signOut()
  }

  async function leaveAndJoin() {
    const current = leaveFirst
    leaveFirst = null
    if (!current) return
    await api.POST('/api/lobbies/{id}/leave', { params: { path: { id: current } } })
    await join()
  }
</script>

<Layout title="Join lobby">
  <main
    class="flex flex-grow flex-col gap-[22px] box-border w-full max-w-[480px] min-w-0 overflow-y-auto px-5 py-7 md:px-8 xl:px-11 md:py-10"
  >
    <div class="flex flex-col gap-2">
      <h2 class="m-0 font-display font-bold text-[34px] leading-none uppercase">Enter the lobby code</h2>
      <p class="m-0 text-[15px] leading-[1.45] text-text-muted">The host sees it at the top of their lobby screen.</p>
    </div>
    <div class="flex flex-col gap-2">
      <label for="lobby-code" class="field-label">Lobby code</label>
      <input
        id="lobby-code"
        bind:value={text}
        autocomplete="one-time-code"
        autocapitalize="characters"
        spellcheck="false"
        placeholder="K7Q4-MD"
        maxlength="12"
        class="h-[60px] box-border px-4 bg-surface-2 border-2 rounded-[12px] text-text font-mono text-[26px] tracking-[0.16em] text-center uppercase
               {missing || failed ? 'border-live' : 'border-accent'}"
      />
      {#if missing}<span class="text-[13px] text-live-text">No open lobby with that code. Check it with the host.</span>{/if}
      {#if failed}
        <span class="text-[13px] text-live-text"
          >Couldn't check the code.
          <button
            type="button"
            onclick={() => check(code)}
            class="p-0 border-0 bg-transparent text-live-text underline cursor-pointer font-[inherit]">Try again.</button
          ></span
        >
      {/if}
    </div>
    {#if preview}<LobbyPreviewCard
        name={preview.name}
        hostName={preview.hostName}
        boardNames={preview.boardNames}
        peopleCount={preview.peopleCount}
      />{/if}
    <p class="m-0 text-[13px] text-text-dim">Or point your phone's camera at the QR code on the host's lobby screen.</p>
    {#if error}
      <span class="flex flex-wrap items-center gap-3">
        <ErrorText>{error}</ErrorText>
        {#if runningSessionId}<Button variant="outline" size="sm" href="#/session/{runningSessionId}" class="px-3 text-[13px]"
            >Return to game</Button
          >{/if}
      </span>
    {/if}
    <Button size="xl" class="mt-auto" disabled={!preview || busy} onclick={() => void join()}>{busy ? 'Joining…' : `Join as ${you}`}</Button
    >
    <p class="m-0 text-[13px] text-center text-text-muted">
      Not {you}?
      <button
        type="button"
        onclick={switchAccount}
        class="p-0 border-0 bg-transparent text-accent font-semibold cursor-pointer font-[inherit]">Switch account</button
      >
    </p>
  </main>
</Layout>

{#if leaveFirst && preview}
  <SwitchLobbyConfirm
    from={$me?.lobby?.name ?? 'your lobby'}
    to={preview.name}
    onconfirm={() => void leaveAndJoin()}
    oncancel={() => (leaveFirst = null)}
  />
{/if}
