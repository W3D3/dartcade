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

  type Preview = { id: string; name: string; hostName: string | null; peopleCount: number; boardNames: string[] }
  let { params = {} }: { params?: { code?: string } } = $props()

  // Filled from the link once; typing changes it from there
  let text = $state(untrack(() => formatCode(normalizeCode(params.code ?? ''))))
  const code = $derived(normalizeCode(text))
  let preview = $state<Preview | null>(null)
  let missing = $state(false)
  let error = $state('')
  let busy = $state(false)
  let leaveFirst = $state<string | null>(null)
  const you = $derived($currentUser?.name ?? 'you')

  $effect(() => {
    const c = code
    preview = null
    missing = false
    if (c.length !== 6) return
    api.GET('/api/lobby-codes/{code}', { params: { path: { code: c } } })
      .then(({ data }) => { if (code === c) { preview = data ?? null; missing = !data } })
      .catch(() => { if (code === c) missing = true })
  })

  async function join() {
    if (!preview) return
    busy = true
    error = ''
    try {
      const res = await api.POST('/api/lobbies/{id}/join', { params: { path: { id: preview.id } }, body: { code } })
      if (res.data) { void push('/lobby'); return }
      const r: Refusal = res.error
      if (r.code === 'in_lobby' && r.lobbyId && r.lobbyId !== preview.id) leaveFirst = r.lobbyId
      else error = describeConflict(r)
    } finally { busy = false }
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
  <main class="flex flex-grow flex-col gap-[22px] box-border w-full max-w-[480px] min-w-0 overflow-y-auto px-5 py-7 md:px-11 md:py-10">
    <div class="flex flex-col gap-2">
      <h2 class="m-0 font-display font-bold text-[34px] leading-none uppercase">Enter the lobby code</h2>
      <p class="m-0 text-[15px] leading-[1.45] text-text-muted">The host sees it at the top of their lobby screen.</p>
    </div>
    <div class="flex flex-col gap-2">
      <label for="lobby-code" class="text-[14px] font-medium text-ink-soft">Lobby code</label>
      <input id="lobby-code" bind:value={text} autocomplete="one-time-code" autocapitalize="characters" spellcheck="false"
        placeholder="K7Q4-MD" maxlength="12"
        class="h-[60px] box-border px-4 bg-surface-2 border-2 rounded-[12px] text-text font-mono text-[26px] tracking-[0.16em] text-center uppercase
               {missing ? 'border-live' : 'border-accent'}" />
      {#if missing}<span class="text-[13px] text-live-text">No open lobby with that code. Check it with the host.</span>{/if}
    </div>
    {#if preview}<LobbyPreviewCard name={preview.name} hostName={preview.hostName} boardNames={preview.boardNames} peopleCount={preview.peopleCount} />{/if}
    <p class="m-0 text-[13px] text-text-dim">Or point your phone's camera at the QR code on the host's lobby screen.</p>
    {#if error}<ErrorText>{error}</ErrorText>{/if}
    <Button class="mt-auto h-14" disabled={!preview || busy} onclick={() => void join()}>{busy ? 'Joining…' : `Join as ${you}`}</Button>
    <p class="m-0 text-[13px] text-center text-text-muted">
      Not {you}? <button type="button" onclick={() => void signOut()} class="p-0 border-0 bg-transparent text-accent font-semibold cursor-pointer font-[inherit]">Switch account</button>
    </p>
  </main>
</Layout>

{#if leaveFirst && preview}
  <SwitchLobbyConfirm from={$me?.lobby?.name ?? 'your lobby'} to={preview.name}
    onconfirm={() => void leaveAndJoin()} oncancel={() => leaveFirst = null} />
{/if}
