<script lang="ts">
  import { Button } from '$lib/components/ui/button/index.js'
  import {
    normalizePairingCode,
    formatPairingCode,
    extractPairingCode,
    CODE_LENGTH,
  } from '$lib/pairing'

  let { onclose, onpaired } = $props<{
    onclose: () => void
    onpaired: (info: { boardId: string; name: string }) => void
  }>()

  const CHIPS = ['Living room', 'Garage', 'Basement', 'Club']

  let code = $state('')
  let name = $state('')
  let helpExpanded = $state(true)
  let focused = $state(false)
  let loading = $state(false)
  let copied = $state(false)
  let errorKind = $state<null | 'expired' | 'notfound' | 'used' | 'network'>(null)
  let inputEl: HTMLInputElement | undefined

  const complete = $derived(code.length === CODE_LENGTH)
  const canSubmit = $derived(complete && name.trim().length > 0 && !loading)
  const activeIndex = $derived(Math.min(code.length, CODE_LENGTH - 1))
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

  function clearFieldError() {
    if (errorKind && errorKind !== 'network') errorKind = null
  }

  function onInput(e: Event) {
    code = normalizePairingCode((e.target as HTMLInputElement).value)
    clearFieldError()
  }

  function onPaste(e: ClipboardEvent) {
    const text = e.clipboardData?.getData('text') ?? ''
    const extracted = extractPairingCode(text)
    if (extracted) {
      e.preventDefault()
      code = extracted
      errorKind = null
    }
  }

  function onFocus() {
    focused = true
    helpExpanded = false
  }

  function focusInput() {
    inputEl?.focus()
  }

  function pickChip(label: string) {
    name = label
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
      const res = await fetch('/api/pairing/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, name: name.trim() }),
      })
      if (res.ok) {
        const body = await res.json().catch(() => ({}))
        onpaired({ boardId: body.boardId, name: body.name ?? name.trim() })
        return
      }
      if (res.status === 410) errorKind = 'expired'
      else if (res.status === 404) errorKind = 'notfound'
      else if (res.status === 409) errorKind = 'used'
      else errorKind = 'network'
    } catch {
      errorKind = 'network'
    } finally {
      loading = false
    }
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onclose()
  }
</script>

<svelte:window onkeydown={onKeydown} />

<div
  class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
  role="dialog"
  aria-modal="true"
  aria-labelledby="pair-title"
>
  <div
    class="w-full max-w-md box-border p-8 rounded-[18px] bg-surface-1 border border-line-2
           flex flex-col gap-5 max-h-[90vh] overflow-y-auto"
  >
    <!-- Header -->
    <div class="flex items-start justify-between">
      <div class="flex flex-col gap-1">
        <h2 id="pair-title" class="m-0 font-display font-bold text-[28px] uppercase leading-none">
          Pair a board
        </h2>
        <p class="m-0 text-[14px] text-text-muted">Links an Autodarts board to your account.</p>
      </div>
      <button
        type="button"
        onclick={onclose}
        aria-label="Close"
        class="text-text-dim hover:text-text transition-colors -mr-1 -mt-1 p-1"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          stroke-width="2" stroke-linecap="round" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </div>

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
            <button
              type="button"
              onclick={copyCommand}
              class="text-[12px] text-accent hover:underline"
            >
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
      <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
      <div class="relative flex items-center gap-2" onclick={focusInput}>
        {#each Array(CODE_LENGTH) as _, i (i)}
          {#if i === 4}
            <span class="text-text-dim font-mono px-0.5">–</span>
          {/if}
          <div
            class="flex-1 aspect-[3/4] max-w-[46px] flex items-center justify-center rounded-[10px]
                   font-mono text-[24px] font-semibold border transition-colors
                   {cellsInvalid
                     ? 'border-live bg-live/5 text-text'
                     : i === activeIndex && focused
                       ? 'border-accent bg-surface-2 text-text'
                       : 'border-line-2 bg-surface-2 text-text'}"
          >
            {code[i] ?? ''}
            {#if i === activeIndex && focused && !code[i]}
              <span class="w-[2px] h-[26px] bg-accent animate-pulse"></span>
            {/if}
          </div>
        {/each}
        <input
          bind:this={inputEl}
          value={code}
          oninput={onInput}
          onpaste={onPaste}
          onfocus={onFocus}
          onblur={() => (focused = false)}
          inputmode="text"
          autocapitalize="characters"
          autocomplete="off"
          spellcheck="false"
          aria-label="Pairing code"
          class="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        />
      </div>
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
      <input
        type="text"
        placeholder="e.g. Living room"
        bind:value={name}
        class="h-11 px-3 rounded-[10px] bg-surface-2 border border-line-2 text-[15px]
               focus:outline-none focus:border-accent"
      />
      <div class="flex flex-wrap gap-2">
        {#each CHIPS as chip (chip)}
          <button
            type="button"
            onclick={() => pickChip(chip)}
            class="px-3 py-1 rounded-full text-[13px] border transition-colors
                   {name === chip
                     ? 'border-accent text-accent bg-accent/10'
                     : 'border-line-2 text-text-muted hover:border-line-3'}"
          >
            {chip}
          </button>
        {/each}
      </div>
    </div>

    <!-- Footer -->
    <div class="flex gap-3 justify-end pt-1">
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
    </div>
  </div>
</div>
