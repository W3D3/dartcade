<script lang="ts">
  // The Settings page's Caller voices card (Settings and Settings-Phone boards): storage used,
  // the user's packs (sample, delete), the built-in voices, and importing a pack from a zip
  // (drop or choose, with upload progress) or from a link. The server keeps the packs and
  // decides what an import keeps; this shows what it says.
  import { onDestroy } from 'svelte'
  import { Link, LoaderCircle, Play, Trash, Upload, Volume2 } from '@lucide/svelte'
  import { Button } from '$lib/components/ui/button/index.js'
  import { Input } from '$lib/components/ui/input/index.js'
  import ErrorText from '$lib/components/ErrorText.svelte'
  import { createCaller } from '$lib/caller/player.js'
  import { audioContext } from '$lib/sounds.js'
  import {
    deleteVoicePack,
    formatMB,
    importVoicePackFromLink,
    keptText,
    packClips,
    sampleKey,
    storageUse,
    uploadVoicePack,
    voiceLibrary,
    type ImportOutcome,
  } from '$lib/caller/voices.js'

  let {
    current,
    volume,
  }: {
    /** The voice the caller uses on this device (a pack id, `builtin:<id>` or null): marked "your voice". */
    current: string | null
    /** The game settings' volume (0–1), for the samples. */
    volume: number
  } = $props()

  const lib = $derived($voiceLibrary)
  const storage = $derived(storageUse(lib.usage))
  const importsOn = $derived(lib.usage.limitBytes > 0)
  const builtinLine = $derived(
    lib.builtins.length
      ? `Built-in: ${lib.builtins.map(b => b.name).join(', ')}. ${lib.builtins.length === 1 ? "It doesn't" : "They don't"} use your space.`
      : '',
  )

  // ── Samples ──
  const caller = createCaller(() => volume)
  onDestroy(() => {
    caller.stop()
  })
  // The pack's own clips only (never the built-in voice's): 180 if it has it, else a key it has
  async function sample(id: string) {
    audioContext()
    const clips = await packClips(id)
    const key = clips ? sampleKey(clips) : null
    if (clips && key !== null) await caller.say([[key]], clips)
  }

  // ── Delete ──
  let deleting = $state<string | null>(null)
  let deleteError = $state<string | null>(null)
  async function remove(id: string) {
    deleting = id
    deleteError = await deleteVoicePack(id)
    deleting = null
  }

  // ── Imports (one at a time; the server refuses a second one too) ──
  let upload = $state<{ name: string; bytes: number; progress: number } | null>(null)
  let uploadAbort: AbortController | null = null
  let linkUrl = $state('')
  let linkBusy = $state(false)
  let result = $state<{ kind: 'done'; name: string; text: string } | { kind: 'error'; text: string } | null>(null)
  let dragging = $state(false)
  const busy = $derived(upload !== null || linkBusy)

  function show(outcome: ImportOutcome) {
    if (outcome.kind === 'done') result = { kind: 'done', name: outcome.pack.name, text: keptText(outcome.pack) }
    else if (outcome.kind === 'error') result = { kind: 'error', text: outcome.error }
  }

  // Leaving the page doesn't cancel an upload: it keeps going, and the list reloads when it's in
  async function startUpload(file: File | undefined) {
    if (!file || busy) return
    result = null
    uploadAbort = new AbortController()
    upload = { name: file.name, bytes: file.size, progress: 0 }
    const outcome = await uploadVoicePack(
      file,
      f => {
        if (upload) upload.progress = f
      },
      uploadAbort.signal,
    )
    upload = null
    uploadAbort = null
    show(outcome)
  }

  async function importLink(e: SubmitEvent) {
    e.preventDefault()
    const url = linkUrl.trim()
    if (!url || busy) return
    result = null
    linkBusy = true
    const outcome = await importVoicePackFromLink(url)
    linkBusy = false
    if (outcome.kind === 'done') linkUrl = ''
    show(outcome)
  }

  function onDragOver(e: DragEvent) {
    e.preventDefault()
    if (!busy) dragging = true
  }
  function onDragLeave(e: DragEvent) {
    if (e.relatedTarget instanceof Node && e.currentTarget instanceof Node && e.currentTarget.contains(e.relatedTarget)) return
    dragging = false
  }
  function onDrop(e: DragEvent) {
    e.preventDefault()
    dragging = false
    void startUpload(e.dataTransfer?.files[0])
  }
</script>

<section
  id="caller-voices"
  aria-labelledby="cv-title"
  class="box-border p-4 md:p-[22px] rounded-[14px] bg-surface-panel border border-line-2 flex flex-col gap-[14px]"
>
  <div class="flex flex-col gap-1">
    <h2 id="cv-title" class="m-0 font-display font-bold text-[26px] md:text-[28px] leading-none uppercase">Caller voices</h2>
    <p class="m-0 text-[13px] md:text-[14px] leading-normal text-text-muted">
      <span class="md:hidden">On your account, ready on every board and device.</span>
      <span class="hidden md:inline"
        >Packs you import live on your account, so they're ready on every board and device. Pick one in a match from the game settings.</span
      >
    </p>
  </div>

  {#if lib.error}<ErrorText>{lib.error}</ErrorText>{/if}

  {#if lib.loaded}
    {#if importsOn}
      <div role="group" aria-label="Storage for caller voices" class="flex flex-col gap-2">
        <div class="flex justify-between items-baseline gap-[10px]">
          <span class="text-[14px] md:text-[15px] text-text">Voices use <strong>{storage.used}</strong> of {storage.limit} MB</span>
          <span class="text-[12px] text-text-dim whitespace-nowrap">{storage.left} MB free</span>
        </div>
        <span
          role="meter"
          aria-label="Voice storage used"
          aria-valuemin={0}
          aria-valuemax={lib.usage.limitBytes}
          aria-valuenow={Math.min(lib.usage.bytes, lib.usage.limitBytes)}
          aria-valuetext="{storage.used} of {storage.limit} MB"
          class="relative block h-2 rounded-[4px] bg-line overflow-hidden"
        >
          <span class="absolute inset-y-0 left-0 rounded-[4px] bg-accent" style:width="{storage.percent}%"></span>
        </span>
      </div>
    {:else}
      <p class="m-0 text-[14px] text-text-dim">Importing voices is turned off on this server.</p>
    {/if}

    <div class="flex flex-col gap-2">
      <span class="text-[12px] font-semibold uppercase tracking-[0.1em] text-text-dim">Your packs · {lib.packs.length}</span>
      {#if lib.packs.length}
        <ul class="m-0 p-0 list-none flex flex-col gap-[6px]">
          {#each lib.packs as p (p.id)}
            <li class="flex items-center gap-3 min-h-[60px] pl-3 pr-[6px] md:pr-2 rounded-[10px] bg-surface-row border border-line">
              <span class="w-[38px] h-[38px] shrink-0 rounded-[9px] bg-surface-paused text-accent flex items-center justify-center">
                <Volume2 size={20} strokeWidth={1.8} />
              </span>
              <span class="flex flex-col gap-[2px] min-w-0 flex-grow">
                <span class="text-[15px] font-semibold truncate">{p.name}</span>
                <span class="text-[12px] text-text-muted">
                  {p.clips.toLocaleString('en-US')} clips · {formatMB(p.bytes)} MB{#if p.id === current}&nbsp;· <span class="text-accent"
                      >your voice</span
                    >{/if}
                </span>
              </span>
              <button
                type="button"
                onclick={() => void sample(p.id)}
                aria-label="Play a sample of {p.name}"
                class="w-10 h-10 shrink-0 flex items-center justify-center rounded-[9px] border border-line-chip bg-transparent text-ink-2 cursor-pointer"
              >
                <Play size={14} fill="currentColor" strokeWidth={0} />
              </button>
              <button
                type="button"
                onclick={() => void remove(p.id)}
                disabled={deleting === p.id}
                aria-label="Delete {p.name}"
                class="h-10 px-[10px] md:px-3 shrink-0 flex items-center gap-[6px] rounded-[9px] border border-danger-line bg-transparent
                       text-live-text text-[14px] font-semibold cursor-pointer disabled:opacity-50"
              >
                {#if deleting === p.id}<LoaderCircle size={16} class="animate-spin" />{:else}<Trash size={16} strokeWidth={1.8} />{/if}
                <span class="hidden md:inline">Delete</span>
              </button>
            </li>
          {/each}
        </ul>
      {:else}
        <span class="text-[14px] text-text-dim"
          >No imported voices yet.{lib.builtins.length ? ' The built-in voice is always there.' : ''}</span
        >
      {/if}
      {#if deleteError}<ErrorText>{deleteError}</ErrorText>{/if}
      {#if builtinLine}<span class="text-[12px] text-text-dim">{builtinLine}</span>{/if}
    </div>

    {#if importsOn}
      <div class="h-px bg-line"></div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-[14px] md:gap-[18px]">
        <div class="flex flex-col gap-2">
          <span id="v-zip-label" class="text-[14px] font-semibold">Import zip</span>
          <label
            for="v-zip"
            ondragenter={onDragOver}
            ondragover={onDragOver}
            ondragleave={onDragLeave}
            ondrop={onDrop}
            class="relative box-border min-h-[52px] md:min-h-[132px] p-3 md:p-4 rounded-xl border-[1.5px] border-dashed
                   flex flex-row md:flex-col items-center justify-center gap-2 text-center transition-colors
                   focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent
                   {busy
              ? 'opacity-50 cursor-not-allowed border-accent-line-strong bg-surface-drop'
              : dragging
                ? 'cursor-copy border-accent bg-accent-tint'
                : 'cursor-pointer border-accent-line-strong bg-surface-drop'}"
          >
            <span class="flex text-accent"><Upload class="size-5 md:size-7" strokeWidth={1.6} /></span>
            <span class="md:hidden text-[15px] font-semibold text-accent">Choose a .zip</span>
            <span class="hidden md:inline text-[15px] font-semibold">{dragging ? 'Drop it to import' : 'Drop a .zip here'}</span>
            <span class="hidden md:inline text-[13px] text-text-muted"
              >or <span class="text-accent font-semibold underline">choose a file</span></span
            >
            <input
              id="v-zip"
              type="file"
              accept=".zip,application/zip"
              disabled={busy}
              aria-labelledby="v-zip-label"
              onchange={e => {
                const input = e.currentTarget
                void startUpload(input.files?.[0])
                input.value = ''
              }}
              class="absolute w-px h-px opacity-0 pointer-events-none"
            />
          </label>
        </div>

        <form class="flex flex-col gap-2" onsubmit={importLink}>
          <label for="v-link" class="text-[14px] font-semibold">Import from link</label>
          <div class="flex gap-2">
            <Input
              id="v-link"
              type="url"
              required
              placeholder="https://…"
              aria-describedby="v-sites"
              bind:value={linkUrl}
              disabled={busy}
              class="h-[46px] px-3 rounded-[9px] bg-bg border-line-chip font-mono text-[13px]"
            />
            <Button type="submit" variant="key" disabled={busy} class="h-[46px] px-4 rounded-[9px]">
              {#if linkBusy}<LoaderCircle size={18} class="animate-spin" />Importing…{:else}<Link size={18} strokeWidth={1.8} />Import{/if}
            </Button>
          </div>
          <span id="v-sites" class="text-[12px] leading-[1.45] text-text-dim">
            Works with darts-caller packs (darts-downloads.peschi.org) and Tools for Autodarts folders (autodarts.x10.mx,
            adt-socket.tobias-thiele.de).
          </span>
        </form>
      </div>

      {#if upload}
        {@const pct = Math.round(upload.progress * 100)}
        <div class="flex flex-col gap-2 px-[14px] py-3 rounded-[10px] bg-surface-panel border border-line-2">
          <div class="flex items-center gap-[10px] min-w-0">
            <span class="font-mono text-[13px] text-text truncate">{upload.name}</span>
            <span class="text-[12px] text-text-dim whitespace-nowrap"
              >{formatMB(upload.bytes)} MB · {pct < 100 ? `uploading ${pct}%` : 'importing…'}</span
            >
            {#if pct < 100}
              <button
                type="button"
                onclick={() => uploadAbort?.abort()}
                class="ml-auto h-8 px-[10px] border-0 bg-transparent text-text-muted text-[13px] cursor-pointer">Cancel</button
              >
            {/if}
          </div>
          <span
            role="progressbar"
            aria-label="Uploading {upload.name}"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
            class="block h-1 rounded-[2px] bg-line overflow-hidden"
          >
            <span class="block h-full bg-accent transition-[width]" style:width="{pct}%"></span>
          </span>
          <span class="text-[12px] leading-[1.45] text-text-dim"
            >Only the audio clips are kept, so the voice will be smaller than the zip. You can leave this page; the import keeps going.</span
          >
        </div>
      {:else if result?.kind === 'done'}
        <div role="status" class="flex items-center gap-[10px] min-w-0 px-[14px] py-3 rounded-[10px] bg-surface-panel border border-line-2">
          <span class="font-mono text-[13px] text-text truncate">{result.name}</span>
          <span class="text-[12px] text-accent whitespace-nowrap">{result.text}</span>
        </div>
      {:else if result?.kind === 'error'}
        <ErrorText>{result.text}</ErrorText>
      {/if}

      <p class="m-0 text-[12px] leading-normal text-text-dim">
        A voice pack is a .zip of short .mp3, .ogg or .wav clips named by what they call:
        <span class="font-mono text-ink-2">180.mp3</span>, <span class="font-mono text-ink-2">gameshot.mp3</span>,
        <span class="font-mono text-ink-2">busted.mp3</span>. Missing clips fall back to the built-in voice.
      </p>
    {/if}
  {/if}
</section>
