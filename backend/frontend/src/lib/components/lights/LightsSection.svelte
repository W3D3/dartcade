<script lang="ts">
  // Settings' Lights section (Settings-Lights board): pick a board, turn its lights on or off,
  // manage its paired WLED devices and the ones the bridge found, and the built-in light
  // profile. Pairing and editing a device open a dialog (Task 13); this only holds the hook.
  import { onDestroy, onMount } from 'svelte'
  import { querystring } from 'svelte-spa-router'
  import { RotateCcw } from '@lucide/svelte'
  import SettingSwitch from '$lib/components/SettingSwitch.svelte'
  import ErrorText from '$lib/components/ErrorText.svelte'
  import { Button } from '$lib/components/ui/button/index.js'
  import LightsBoardPicker from './LightsBoardPicker.svelte'
  import WledDeviceRow from './WledDeviceRow.svelte'
  import FoundDevices from './FoundDevices.svelte'
  import LightProfileCard from './LightProfileCard.svelte'
  import { api, type Board, type BoardLights, type FoundWledDevice, type WledDevice } from '$lib/api'

  let boards = $state<Board[]>([])
  // The board list has come back; until then, show neither it nor the empty state
  let loaded = $state(false)
  let boardsError = $state<string | null>(null)
  let selectedId = $state<string | null>(null)
  const selected = $derived(boards.find(b => b.id === selectedId) ?? null)
  let deviceCounts = $state<Record<string, number>>({})
  let lights = $state<BoardLights | null>(null)
  let now = $state(new Date())
  // A monotonic token: each loadLights call takes the next one, and only applies its response
  // if it's still the most recent call issued (newer than any later call, for any board) — so a
  // late response from a superseded request (e.g. A → B → A, where the first A request was
  // slow) can never overwrite a fresher one. `pendingReq` separately tracks whether the latest
  // call is still unresolved, so a poll tick can skip while one is already in flight; a board
  // switch always calls loadLights directly, bypassing that check.
  let lightsReq = 0
  let pendingReq: number | null = null

  let deviceError = $state<string | null>(null)
  let testError = $state<string | null>(null)
  let enabledError = $state<string | null>(null)

  /** The next task's pair/edit dialog hook. */
  let dialog = $state<{ mode: 'pair'; device: FoundWledDevice } | { mode: 'edit'; device: WledDevice } | null>(null)

  let pollTimer: ReturnType<typeof setInterval> | null = null
  let nowTimer: ReturnType<typeof setInterval> | null = null

  async function loadLights(id: string) {
    const req = ++lightsReq
    pendingReq = req
    try {
      const { data } = await api.GET('/api/boards/{id}/lights', { params: { path: { id } } })
      // A newer call has been issued since: this response is stale, no matter the board
      if (!data || req !== lightsReq || id !== selectedId) return
      lights = data
      deviceCounts = { ...deviceCounts, [id]: data.devices.length }
    } catch {
      /* keep the last known state */
    } finally {
      // Only clear the pending marker if no newer call has already taken it
      if (pendingReq === req) pendingReq = null
    }
  }

  function startPoll(id: string) {
    void loadLights(id)
    pollTimer = setInterval(() => {
      // Skip this tick while the previous one is still in flight, rather than piling up requests
      if (!document.hidden && pendingReq === null) void loadLights(id)
    }, 3000)
  }
  function stopPoll() {
    if (pollTimer) clearInterval(pollTimer)
    pollTimer = null
  }

  $effect(() => {
    const id = selectedId
    lights = null
    deviceError = null
    testError = null
    enabledError = null
    if (!id) return
    startPoll(id)
    return stopPoll
  })

  async function loadBoards() {
    boardsError = null
    const res = await api.GET('/api/boards').catch(() => null)
    if (!res || res.error) {
      boardsError = "Couldn't load your boards"
      loaded = true
      return
    }
    boards = res.data.boards
    loaded = true
    const fromQuery = new URLSearchParams($querystring).get('board')
    const matched = fromQuery ? boards.find(b => b.id === fromQuery) : undefined
    selectedId = matched?.id ?? (boards.length ? boards[0].id : null)
    for (const b of boards) {
      void api
        .GET('/api/boards/{id}/lights', { params: { path: { id: b.id } } })
        .then(({ data: d }) => {
          if (d) deviceCounts = { ...deviceCounts, [b.id]: d.devices.length }
        })
        .catch(() => {})
    }
  }

  onMount(() => {
    void loadBoards()
    nowTimer = setInterval(() => {
      now = new Date()
    }, 30_000)
  })
  onDestroy(() => {
    stopPoll()
    if (nowTimer) clearInterval(nowTimer)
  })

  async function setEnabled(enabled: boolean) {
    if (!selectedId || !lights) return
    const id = selectedId
    const prev = lights.enabled
    enabledError = null
    lights = { ...lights, enabled }
    const { error } = await api
      .PUT('/api/boards/{id}/lights', { params: { path: { id } }, body: { enabled } })
      .catch(() => ({ error: true }))
    if (!error) return
    // The board (or its lights) may have moved on while this was in flight; only undo our own change
    const current: BoardLights | null = id === selectedId ? lights : null
    if (current) {
      lights = { ...current, enabled: prev }
      enabledError = 'Could not save that'
    }
  }

  async function rescan() {
    if (!selectedId) return
    deviceError = null
    const { error } = await api
      .POST('/api/boards/{id}/lights/scan', { params: { path: { id: selectedId } } })
      .catch(() => ({ error: true }))
    if (error) deviceError = "Couldn't ask the bridge to scan"
    else await loadLights(selectedId)
  }

  /** Resolves to whether the bridge accepted the request; the probe result itself arrives via polling. */
  async function probe(host: string): Promise<boolean> {
    if (!selectedId || !host) return false
    deviceError = null
    const { error } = await api
      .POST('/api/boards/{id}/lights/probe', { params: { path: { id: selectedId } }, body: { host } })
      .catch(() => ({ error: true }))
    if (error) {
      deviceError = "Couldn't ask the bridge to probe that address"
      return false
    }
    await loadLights(selectedId)
    return true
  }

  async function blink(device: WledDevice) {
    if (!selectedId) return
    deviceError = null
    const { error } = await api
      .POST('/api/boards/{id}/lights/blink', { params: { path: { id: selectedId } }, body: { deviceId: device.id } })
      .catch(() => ({ error: true }))
    if (error) deviceError = "Couldn't blink that device"
  }

  async function remove(device: WledDevice) {
    if (!selectedId) return
    deviceError = null
    const { error } = await api
      .DELETE('/api/boards/{id}/lights/devices/{deviceId}', { params: { path: { id: selectedId, deviceId: device.id } } })
      .catch(() => ({ error: true }))
    if (error) deviceError = 'Could not remove that device'
    else await loadLights(selectedId)
  }

  async function test(rule: number) {
    if (!selectedId) return
    testError = null
    const res = await api.POST('/api/boards/{id}/lights/test', { params: { path: { id: selectedId } }, body: { rule } }).catch(() => null)
    if (!res || res.error) {
      const status = res?.response.status
      testError = status === 409 ? 'Lights are off' : status === 503 ? 'The bridge is offline' : 'Could not play that rule'
    }
  }
</script>

{#if selected}
  <div class="flex flex-col gap-[18px]">
    <div class="flex items-center gap-4 flex-wrap">
      <LightsBoardPicker {boards} {selectedId} {deviceCounts} onselect={(id: string) => (selectedId = id)} />
      {#if lights}
        <div class="ml-auto flex flex-col items-end gap-1">
          <div class="flex items-center gap-3 px-[10px] py-2 pl-[14px] rounded-[12px] card">
            <SettingSwitch
              id="lights-enabled"
              label="Lights on {selected.name}"
              sub="Off keeps devices and rules"
              checked={lights.enabled}
              onchange={(checked: boolean) => void setEnabled(checked)}
            />
          </div>
          {#if enabledError}<ErrorText>{enabledError}</ErrorText>{/if}
        </div>
      {/if}
    </div>

    {#if lights?.bridgeOutdated}
      <p class="m-0 text-[13px] text-warn">Update your bridge to use lights.</p>
    {:else if lights && !lights.bridgeOnline}
      <p class="m-0 text-[13px] text-live-text">The bridge is offline.</p>
    {/if}

    {#if lights}
      {@const canAct = lights.bridgeOnline && !lights.bridgeOutdated}
      {@const canTest = canAct && lights.enabled}
      <div class="grid grid-cols-1 xl:grid-cols-[1fr_1.08fr] gap-[18px] items-start">
        <section aria-label="WLED devices · {lights.devices.length}" class="box-border p-4 md:p-[22px] card flex flex-col gap-[14px]">
          <div class="flex items-center justify-between gap-3">
            <h2 class="m-0 text-[17px] font-semibold">WLED devices · {lights.devices.length}</h2>
            <Button variant="outline" size="sm" disabled={!canAct} onclick={() => void rescan()}>
              <RotateCcw size={14} />Rescan
            </Button>
          </div>
          {#if deviceError}<ErrorText>{deviceError}</ErrorText>{/if}
          <ul class="m-0 p-0 list-none flex flex-col gap-2">
            {#each lights.devices as device (device.id)}
              <WledDeviceRow
                {device}
                {now}
                disabled={!canAct}
                onblink={() => void blink(device)}
                onedit={() => {
                  dialog = { mode: 'edit', device }
                }}
                onremove={() => remove(device)}
              />
            {:else}
              <li class="text-[13px] text-text-dim">No devices paired yet.</li>
            {/each}
          </ul>
          <FoundDevices
            found={lights.found}
            lastScanAt={lights.lastScanAt}
            scanError={lights.scanError}
            probe={lights.probe}
            disabled={!canAct}
            {now}
            onpair={(device: FoundWledDevice) => {
              dialog = { mode: 'pair', device }
            }}
            onprobe={(host: string) => probe(host)}
          />
        </section>

        <div class="flex flex-col gap-3">
          {#if testError}<ErrorText>{testError}</ErrorText>{/if}
          <LightProfileCard profile={lights.profile} {canTest} ontest={(rule: number) => void test(rule)} />
        </div>
      </div>
    {/if}
  </div>
  {#if dialog}
    <!-- Task 13 renders the pair/edit dialog here, from `dialog` -->
  {/if}
{:else if boardsError}
  <div class="flex items-center gap-3">
    <ErrorText>{boardsError}</ErrorText>
    <Button variant="outline" size="sm" onclick={() => void loadBoards()}>Retry</Button>
  </div>
{:else if loaded}
  <p class="m-0 text-[14px] text-text-muted">Pair a board first, in the Boards section, to set up its lights.</p>
{/if}
