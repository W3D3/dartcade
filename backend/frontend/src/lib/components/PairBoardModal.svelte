<script lang="ts">
  import { createCopy } from '$lib/clipboard.svelte'
  import { onDestroy, onMount } from 'svelte'
  import { ChevronRight, CircleCheck, LoaderCircle } from '@lucide/svelte'
  import { Button } from '$lib/components/ui/button/index.js'
  import { Input } from '$lib/components/ui/input/index.js'
  import { Chip } from '$lib/components/ui/chip/index.js'
  import { Modal } from '$lib/components/ui/modal/index.js'
  import CodeInput from '$lib/components/CodeInput.svelte'
  import { CODE_LENGTH, normalizePairingCode } from '$lib/pairing'
  import { api } from '$lib/api'
  import { OSES, OS_LABELS, OS_NOTES, detectOs, installCommand, type Os } from '$lib/bridgeInstall'

  let {
    initialCode = '',
    onclose,
    onpaired,
  }: {
    /** A code already typed elsewhere (the Boards empty state's field). */
    initialCode?: string
    onclose: () => void
    onpaired: (info: { boardId: string; name: string }) => void
  } = $props()

  const CHIPS = ['Living room', 'Garage', 'Basement', 'Club']

  // svelte-ignore state_referenced_locally
  let code = $state(normalizePairingCode(initialCode))
  let name = $state('')
  // svelte-ignore state_referenced_locally
  let helpExpanded = $state(initialCode === '')
  let loading = $state(false)
  const clip = createCopy(1500)
  let errorKind = $state<null | 'expired' | 'notfound' | 'used' | 'network'>(null)

  // Install mode: the user runs a command with a one-time install token; the board it creates shows up here to be named.
  // svelte-ignore state_referenced_locally
  let mode = $state<'install' | 'code'>(initialCode === '' ? 'install' : 'code')
  let os = $state<Os>(detectOs(navigator.userAgent))
  let token = $state<string | null>(null)
  let tokenFailed = $state(false)
  let found = $state<{ id: string } | null>(null)
  let started = false
  let poll: ReturnType<typeof setInterval> | undefined
  const command = $derived(token ? installCommand(os, token, location.origin) : '')

  async function checkForBoard(known: Set<string>) {
    const boards = (await api.GET('/api/boards').catch(() => null))?.data?.boards ?? []
    const board = boards.find(b => !known.has(b.id))
    if (board) {
      found = board
      clearInterval(poll)
    }
  }

  async function startInstall() {
    if (started) return
    started = true
    try {
      const known = new Set(((await api.GET('/api/boards')).data?.boards ?? []).map(b => b.id))
      const { data } = await api.POST('/api/bridge-install-tokens')
      if (!data) throw new Error('no token')
      token = data.token
      poll = setInterval(() => void checkForBoard(known), 2500)
    } catch {
      tokenFailed = true
    }
  }

  function switchMode(next: 'install' | 'code') {
    mode = next
    if (next === 'install') void startInstall()
  }

  onMount(() => {
    if (mode === 'install') void startInstall()
  })
  onDestroy(() => clearInterval(poll))

  const complete = $derived(code.length === CODE_LENGTH)
  const canSubmit = $derived(
    mode === 'install' ? found !== null && name.trim().length > 0 && !loading : complete && name.trim().length > 0 && !loading,
  )
  const cellsInvalid = $derived(errorKind === 'expired' || errorKind === 'notfound' || errorKind === 'used')
  const fieldError = $derived(
    errorKind === 'expired'
      ? 'This code has expired. The bridge shows a new code every 10 minutes. Enter the newest one from its log.'
      : errorKind === 'notfound'
        ? 'No board is waiting with this code. Check it against the bridge log.'
        : errorKind === 'used'
          ? 'This code was already used. Start the bridge again for a fresh code.'
          : null,
  )
  const buttonLabel = $derived(
    loading ? 'Saving…' : errorKind === 'network' ? 'Try again' : mode === 'install' ? 'Save board' : 'Pair board',
  )

  function onCodeInput() {
    // Clear a field-level error as soon as the user edits the code again.
    if (errorKind && errorKind !== 'network') errorKind = null
  }

  function copyCommand() {
    void clip.copy(mode === 'install' ? command : 'dartcade-bridge')
  }

  async function submit() {
    if (!canSubmit) return
    loading = true
    errorKind = null
    try {
      if (found) {
        const { error } = await api.PATCH('/api/boards/{id}', { params: { path: { id: found.id } }, body: { name: name.trim() } })
        if (error) errorKind = 'network'
        else onpaired({ boardId: found.id, name: name.trim() })
        return
      }
      const { data, response } = await api.POST('/api/pairing/claim', { body: { code, name: name.trim() } })
      if (data) {
        onpaired({ boardId: data.boardId, name: data.name })
        return
      }
      if (response.status === 410) errorKind = 'expired'
      else if (response.status === 404) errorKind = 'notfound'
      else if (response.status === 409) errorKind = 'used'
      else errorKind = 'network'
    } catch {
      errorKind = 'network'
    } finally {
      loading = false
    }
  }
</script>

<Modal {onclose} title="Pair a board" subtitle="Links an Autodarts board to your account.">
  {#if mode === 'install'}
    <div class="flex flex-col gap-3">
      <p class="m-0 text-[14px] text-text-muted">
        Run this on the computer next to your board (the one running Autodarts). The command signs the bridge in to your account, so there
        is no code to type.
      </p>
      <div class="flex flex-wrap gap-2" role="group" aria-label="Operating system">
        {#each OSES as id (id)}
          <Chip selected={os === id} onclick={() => (os = id)}>{OS_LABELS[id]}</Chip>
        {/each}
      </div>
      {#if tokenFailed}
        <p class="m-0 text-[13px] text-live-text">
          Couldn't make an install command. Check your connection, or use a pairing code instead.
        </p>
      {:else}
        <div class="rounded-[10px] bg-surface-2 border border-line-2 overflow-hidden">
          <div class="flex items-center justify-between px-3 py-2 border-b border-line-2">
            <span class="text-[12px] text-text-dim">{OS_LABELS[os]}</span>
            <button type="button" onclick={copyCommand} disabled={!token} class="text-[12px] text-accent hover:underline">
              {clip.state === 'copied' ? 'Copied' : 'Copy command'}
            </button>
          </div>
          <pre class="m-0 px-3 py-2 font-mono text-[12px] leading-relaxed text-text break-all whitespace-pre-wrap">{token
              ? command
              : 'Making your command…'}</pre>
        </div>
        <p class="m-0 text-[13px] text-text-dim">
          {OS_NOTES[os]} The command works once and expires in 15 minutes.
        </p>
        {#if found}
          <p class="m-0 flex items-center gap-2 text-[14px] text-text">
            <CircleCheck size={16} class="text-accent" /> Bridge connected. Name your board.
          </p>
        {:else if token}
          <p class="m-0 flex items-center gap-2 text-[14px] text-text-muted">
            <LoaderCircle size={16} class="animate-spin" /> Waiting for the bridge to connect…
          </p>
        {/if}
      {/if}
      <button type="button" onclick={() => switchMode('code')} class="text-[13px] text-text-muted hover:text-text self-start underline">
        Use a pairing code instead
      </button>
    </div>
  {:else if helpExpanded}
    <div class="flex flex-col gap-3">
      <ol class="m-0 flex flex-col gap-2 list-none p-0">
        <li class="flex gap-2 text-[14px]">
          <span class="text-accent font-mono">1</span>
          <span
            >Run <code class="font-mono bg-surface-2 px-1 rounded">dartcade-bridge</code>
            on the machine next to your board.</span
          >
        </li>
        <li class="flex gap-2 text-[14px]">
          <span class="text-accent font-mono">2</span>
          <span>Type the 8-character code it prints, then name the board.</span>
        </li>
      </ol>
      <div class="rounded-[10px] bg-surface-2 border border-line-2 overflow-hidden">
        <div class="flex items-center justify-between px-3 py-2 border-b border-line-2">
          <span class="text-[12px] text-text-dim">On the board's machine</span>
          <button type="button" onclick={copyCommand} class="text-[12px] text-accent hover:underline">
            {clip.state === 'copied' ? 'Copied' : 'Copy command'}
          </button>
        </div>
        <pre class="m-0 px-3 py-2 font-mono text-[12px] leading-relaxed text-text-muted whitespace-pre-wrap"><span class="text-text"
            >$ dartcade-bridge</span
          >
<span class="text-accent">✓</span> Board Manager found at 192.168.1.42
  Pairing code <span class="text-accent">7KQ4-M2XD</span> · new code every 10 min</pre>
      </div>
    </div>
  {:else}
    <button
      type="button"
      onclick={() => (helpExpanded = true)}
      class="flex items-center gap-2 text-[14px] text-text-muted hover:text-text transition-colors self-start"
    >
      <ChevronRight size={14} />
      Where do I find the code?
    </button>
  {/if}

  <!-- Network error banner -->
  {#if errorKind === 'network'}
    <div class="flex gap-2 px-3 py-2 rounded-[10px] bg-live/10 border border-live/40 text-[13px]">
      <span class="text-live-text">⚠</span>
      <span class="text-text-muted">
        <span class="text-live-text font-semibold">Couldn't reach Dartcade.</span>
        Your code and name are kept. Check your connection and try again.
      </span>
    </div>
  {/if}

  <!-- Pairing code -->
  {#if mode === 'code'}
    <div class="flex flex-col gap-2">
      <div class="flex items-center justify-between">
        <span class="text-[13px] text-text-dim">Pairing code</span>
        <span class="font-mono text-[12px] text-text-dim">{code.length} / {CODE_LENGTH}</span>
      </div>
      <CodeInput
        bind:value={code}
        invalid={cellsInvalid}
        onfocus={() => (helpExpanded = false)}
        oninput={onCodeInput}
        label="Pairing code"
      />
      {#if fieldError}
        <p class="m-0 text-[13px]">
          <span class="text-live-text font-semibold">{fieldError.split('.')[0]}.</span>
          <span class="text-text-muted">{fieldError.slice(fieldError.indexOf('.') + 1).trim()}</span>
        </p>
      {:else}
        <p class="m-0 text-[13px] text-text-dim">
          Use the newest code in the log; it changes every 10 minutes. Not case-sensitive, and pasting the whole line works.
        </p>
      {/if}
    </div>

    <button type="button" onclick={() => switchMode('install')} class="text-[13px] text-text-muted hover:text-text self-start underline">
      Install the bridge with a command instead
    </button>
  {/if}

  <!-- Board name -->
  {#if mode === 'code' || found}
    <div class="flex flex-col gap-2">
      <span class="text-[13px] text-text-dim">Board name</span>
      <Input type="text" placeholder="e.g. Living room" bind:value={name} class="h-11" />
      <div class="flex flex-wrap gap-2">
        {#each CHIPS as chip (chip)}
          <Chip selected={name === chip} onclick={() => (name = chip)}>{chip}</Chip>
        {/each}
      </div>
    </div>
  {/if}

  {#snippet footer()}
    <Button variant="ghost" class="h-[54px]" onclick={onclose} disabled={loading}>Cancel</Button>
    <Button variant="primary" class="flex-1 max-w-[220px]" onclick={submit} disabled={!canSubmit}>
      {#if loading}
        <LoaderCircle size={16} strokeWidth={2.5} class="animate-spin" />
      {/if}
      {buttonLabel}
    </Button>
  {/snippet}
</Modal>
