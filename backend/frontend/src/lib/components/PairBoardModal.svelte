<script lang="ts">
  import { Button } from '$lib/components/ui/button/index.js'
  import { Input } from '$lib/components/ui/input/index.js'
  import { Chip } from '$lib/components/ui/chip/index.js'
  import { Modal } from '$lib/components/ui/modal/index.js'
  import CodeInput from '$lib/components/CodeInput.svelte'
  import { CODE_LENGTH } from '$lib/pairing'
  import { api } from '$lib/api'

  let { onclose, onpaired }: {
    onclose: () => void
    onpaired: (info: { boardId: string; name: string }) => void
  } = $props()

  const CHIPS = ['Living room', 'Garage', 'Basement', 'Club']

  let code = $state('')
  let name = $state('')
  let helpExpanded = $state(true)
  let loading = $state(false)
  let copied = $state(false)
  let errorKind = $state<null | 'expired' | 'notfound' | 'used' | 'network'>(null)

  const complete = $derived(code.length === CODE_LENGTH)
  const canSubmit = $derived(complete && name.trim().length > 0 && !loading)
  const cellsInvalid = $derived(
    errorKind === 'expired' || errorKind === 'notfound' || errorKind === 'used',
  )
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
    loading ? 'Pairing…' : errorKind === 'network' ? 'Try again' : 'Pair board',
  )

  function onCodeInput() {
    // Clear a field-level error as soon as the user edits the code again.
    if (errorKind && errorKind !== 'network') errorKind = null
  }

  async function copyCommand() {
    try {
      await navigator.clipboard.writeText('dartcade-bridge')
      copied = true
      setTimeout(() => (copied = false), 1500)
    } catch {
      /* clipboard unavailable */
    }
  }

  async function submit() {
    if (!canSubmit) return
    loading = true
    errorKind = null
    try {
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
  <!-- Instructions / help -->
  {#if helpExpanded}
    <div class="flex flex-col gap-3">
      <ol class="m-0 flex flex-col gap-2 list-none p-0">
        <li class="flex gap-2 text-[14px]">
          <span class="text-accent font-mono">1</span>
          <span>Run <code class="font-mono bg-surface-2 px-1 rounded">dartcade-bridge</code>
            on the machine next to your board.</span>
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
            {copied ? 'Copied' : 'Copy command'}
          </button>
        </div>
        <pre class="m-0 px-3 py-2 font-mono text-[12px] leading-relaxed text-text-muted whitespace-pre-wrap"><span class="text-text">$ dartcade-bridge</span>
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
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M9 18l6-6-6-6" />
      </svg>
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
        Use the newest code in the log; it changes every 10 minutes. Not case-sensitive, and
        pasting the whole line works.
      </p>
    {/if}
  </div>

  <!-- Board name -->
  <div class="flex flex-col gap-2">
    <span class="text-[13px] text-text-dim">Board name</span>
    <Input type="text" placeholder="e.g. Living room" bind:value={name} class="h-11" />
    <div class="flex flex-wrap gap-2">
      {#each CHIPS as chip (chip)}
        <Chip selected={name === chip} onclick={() => (name = chip)}>{chip}</Chip>
      {/each}
    </div>
  </div>

  {#snippet footer()}
    <Button variant="ghost" class="h-[54px]" onclick={onclose} disabled={loading}>Cancel</Button>
    <Button variant="primary" class="flex-1 max-w-[220px]" onclick={submit} disabled={!canSubmit}>
      {#if loading}
        <svg class="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" stroke-width="2.5" aria-hidden="true">
          <path d="M12 3a9 9 0 1 0 9 9" stroke-linecap="round" />
        </svg>
      {/if}
      {buttonLabel}
    </Button>
  {/snippet}
</Modal>
