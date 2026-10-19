<script lang="ts">
  // Settings' Lights pair/edit dialog (Task 13, design: Settings-Lights-Pair.dc.html). Pairing a
  // found device: confirm it's the right one by its blink, then name it, pick its board (the one
  // it was found on), set its segment split and cap its brightness. Editing a paired device skips
  // the blink check and opens straight on those details. Blinking happens on open and on "Blink
  // again"; failures show inline here, never as toasts.
  import { onMount } from 'svelte'
  import { Modal } from '$lib/components/ui/modal/index.js'
  import { Button } from '$lib/components/ui/button/index.js'
  import { Input } from '$lib/components/ui/input/index.js'
  import OptionSelect from '$lib/components/settings/OptionSelect.svelte'
  import ErrorText from '$lib/components/ErrorText.svelte'
  import { api, type Board, type FoundWledDevice, type WledDevice } from '$lib/api'
  import { segmentHint } from '$lib/lights/view'
  import { brightnessPercent, confirmBlink, maxBriFromPercent, nextCandidate, startEdit, startPair, type PairState } from '$lib/lights/pair'

  let {
    boardId,
    boards,
    found,
    device,
    mac,
    seats = 4,
    onclose,
    onsaved,
  }: {
    boardId: string
    boards: Board[]
    found: FoundWledDevice[]
    /** Editing an already-paired device; omit when pairing a found one. */
    device?: WledDevice
    /** The found device's mac to pair; required when `device` is omitted. */
    mac?: string
    seats?: number
    onclose: () => void
    onsaved: () => void
  } = $props()

  // svelte-ignore state_referenced_locally
  let pairing = $state<PairState>(device ? startEdit(device, boardId) : startPair(found, mac ?? '', boardId))

  // Looked up by mac, not kept as an index: `found` gets replaced wholesale by every rescan
  // (order isn't stable, a probed-but-gone device just drops out), so an index could end up
  // pointing at a different device than the one on screen. A mac that's no longer there just
  // resolves to no candidate instead of silently substituting another one.
  const candidate = $derived(found.find(d => d.mac === pairing.mac))
  // Only offer "show me another" when there's a different eligible device to switch to
  const hasOtherCandidates = $derived(found.some(d => !d.onBoard && d.mac !== pairing.mac))
  const boardName = $derived(boards.find(b => b.id === boardId)?.name ?? '')
  const leds = $derived(device?.leds ?? candidate?.leds ?? 0)
  const segments = $derived(device?.segments ?? candidate?.segments ?? 1)
  const percent = $derived(brightnessPercent(pairing.maxBri))
  const segmentOptions = $derived([
    { value: 'whole' as const, label: 'Whole strip' },
    { value: 'perSeat' as const, label: 'One per seat' },
    { value: 'wled' as const, label: 'Use WLED segments', disabled: segments < 2 },
  ])

  let blinkOk = $state(false)
  let blinkError = $state<string | null>(null)
  let saveError = $state<string | null>(null)
  let saving = $state(false)
  // Only the latest blink's result shows, even if an older one (a previous "Blink again" or a
  // candidate switch) is still in flight when a newer one resolves
  let blinkSeq = 0

  async function blink(host: string) {
    const seq = ++blinkSeq
    blinkOk = false
    blinkError = null
    const res = await api.POST('/api/boards/{id}/lights/blink', { params: { path: { id: boardId } }, body: { host } }).catch(() => null)
    if (seq !== blinkSeq) return
    if (!res || res.error) blinkError = "Couldn't blink that device"
    else blinkOk = true
  }

  onMount(() => {
    if (pairing.step === 'check' && candidate) void blink(candidate.host)
  })

  let nameInput = $state<HTMLInputElement | null>(null)
  // Confirming the blink removes the focused button from the page; land focus on the first
  // field of the details step instead of losing it
  $effect(() => {
    if (pairing.step === 'details') nameInput?.focus()
  })

  function another() {
    pairing = nextCandidate(pairing, found)
    if (candidate) void blink(candidate.host)
  }

  async function save() {
    // The Pair button is disabled in this case too; belt and suspenders against posting an
    // empty mac if that ever changes
    if (!device && !candidate) return
    saveError = null
    saving = true
    const body = { name: pairing.name.trim(), segmentMode: pairing.segmentMode, maxBri: pairing.maxBri }
    const res = device
      ? await api
          .PATCH('/api/boards/{id}/lights/devices/{deviceId}', { params: { path: { id: pairing.boardId, deviceId: device.id } }, body })
          .catch(() => null)
      : await api
          .POST('/api/boards/{id}/lights/devices', {
            params: { path: { id: pairing.boardId } },
            body: { ...body, mac: candidate?.mac ?? '' },
          })
          .catch(() => null)
    saving = false
    if (!res || res.error) {
      saveError = res?.response.status === 409 ? 'This device is already paired to this board.' : 'Could not save that'
      return
    }
    onsaved()
    onclose()
  }
</script>

<Modal
  {onclose}
  title={device ? `Edit ${device.name}` : 'Pair WLED device'}
  subtitle="Found by the {boardName} bridge on your network"
  widthClass="max-w-xl"
>
  <div class="flex flex-col gap-5">
    {#if !device && !candidate}
      <div class="flex flex-col gap-2">
        <ErrorText>This device isn't on the network any more.</ErrorText>
        {#if pairing.step === 'check' && hasOtherCandidates}
          <button type="button" onclick={another} class="self-start text-[13px] font-semibold text-accent hover:underline"
            >No, show me another</button
          >
        {/if}
      </div>
    {/if}

    {#if pairing.step === 'check' && candidate}
      <div class="flex flex-col gap-3">
        <span class="text-[15px] font-semibold">Check it's the right one</span>
        <div class="flex flex-col gap-2 p-3 rounded-[12px] bg-accent-tint border border-accent-line">
          <div class="flex items-center justify-between gap-3">
            <span class="flex flex-col gap-[2px] min-w-0">
              {#if blinkOk}
                <span class="text-[14px] font-semibold text-accent">Blinking lime now</span>
              {:else if blinkError}
                <span class="text-[14px] font-semibold text-live-text">{blinkError}</span>
              {/if}
              <span class="font-mono text-[12px] text-text-dim">{candidate.name} · {candidate.host} · {candidate.leds} LEDs</span>
            </span>
            <Button variant="outline" size="sm" onclick={() => void blink(candidate.host)}>Blink again</Button>
          </div>
        </div>
        <span class="text-[13px] text-text-muted">
          Is this the strip at your board?
          <Button variant="accent" size="sm" onclick={() => (pairing = confirmBlink(pairing))}>Yes, it blinked</Button>
          {#if hasOtherCandidates}
            <button type="button" onclick={another} class="text-[13px] font-semibold text-accent hover:underline"
              >No, show me another</button
            >
          {/if}
        </span>
      </div>
    {:else if pairing.step === 'details'}
      <div class="flex flex-col gap-3">
        <span class="text-[15px] font-semibold">Name it and pick the board</span>
        <div class="grid grid-cols-2 gap-3">
          <label class="flex flex-col gap-[5px]">
            <span id="pair-name" class="text-[12px] font-semibold text-text-dim">Name</span>
            <Input bind:ref={nameInput} bind:value={pairing.name} maxlength={40} aria-labelledby="pair-name" />
          </label>
          <div class="flex flex-col gap-[5px]">
            <span id="pair-board" class="text-[12px] font-semibold text-text-dim">Board</span>
            {#if device}
              <span class="h-10 px-3 flex items-center rounded-[9px] border border-line-3 bg-surface-inset text-[14px] text-text-dim">
                {boardName}
              </span>
            {:else}
              <OptionSelect
                value={pairing.boardId}
                groups={[{ options: boards.filter(b => b.id === boardId).map(b => ({ value: b.id, label: b.name })) }]}
                labelledby="pair-board"
                class="w-full"
                onchange={(v: string) => (pairing.boardId = v)}
              />
            {/if}
          </div>
        </div>
      </div>

      <div class="flex flex-col gap-3">
        <span id="pair-segment" class="text-[15px] font-semibold">Segments</span>
        <div role="radiogroup" aria-labelledby="pair-segment" class="flex gap-1 p-1 bg-bg rounded-[10px]">
          {#each segmentOptions as opt (opt.value)}
            {@const on = pairing.segmentMode === opt.value}
            <button
              type="button"
              role="radio"
              aria-checked={on}
              disabled={opt.disabled}
              onclick={() => (pairing.segmentMode = opt.value)}
              class="flex-1 h-10 rounded-[7px] text-[14px] border-0 cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed
                   {on ? 'bg-line text-text font-semibold' : 'bg-transparent text-ink-2 font-medium'}">{opt.label}</button
            >
          {/each}
        </div>
        <span class="font-mono text-[12px] text-text-dim">{segmentHint(leds, pairing.segmentMode, seats, segments)}</span>
        {#if pairing.segmentMode === 'perSeat'}
          <span class="text-[12px] text-text-muted">
            The strip splits into as many parts as there are seats; each lights in its seat colour on that seat's turn.
          </span>
        {/if}
      </div>

      <div class="flex flex-col gap-2">
        <div class="flex items-center justify-between gap-3">
          <span id="pair-bri" class="text-[12px] font-semibold text-text-dim">Max brightness</span>
          <span class="font-mono text-[13px] text-text">{percent}%</span>
        </div>
        <input
          type="range"
          min="1"
          max="100"
          value={percent}
          aria-labelledby="pair-bri"
          oninput={e => (pairing.maxBri = maxBriFromPercent(Number(e.currentTarget.value)))}
          class="flex-1 accent-accent"
        />
        <span class="text-[12px] text-text-dim">Caps every rule, so a small power supply never gets overloaded.</span>
      </div>
    {/if}
  </div>

  {#snippet footer()}
    {#if saveError}<ErrorText class="mr-auto">{saveError}</ErrorText>{/if}
    <Button variant="outline" onclick={onclose}>Cancel</Button>
    <Button
      variant="accent"
      disabled={pairing.step === 'check' || saving || !pairing.name.trim() || (!device && !candidate)}
      onclick={() => void save()}
    >
      {device ? 'Save' : 'Pair device'}
    </Button>
  {/snippet}
</Modal>
