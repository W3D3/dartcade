<script lang="ts">
  // Devices (Tournament-Onsite): the venue devices paired to this tournament, each with its name,
  // last seen (or what it plays), Revoke; Add device makes a one-time code. A device paired from
  // here may only keep score for this tournament. Devices of an organizer's own account that are
  // in tournament mode show too. Opens the tournament socket as an organizer.
  import { onDestroy, onMount } from 'svelte'
  import { MonitorSmartphone, Plus } from '@lucide/svelte'
  import ErrorText from '$lib/components/ErrorText.svelte'
  import ConfirmModal from '$lib/components/ConfirmModal.svelte'
  import AddDeviceDialog from '$lib/components/tournaments/mode/AddDeviceDialog.svelte'
  import { Button } from '$lib/components/ui/button/index.js'
  import type { Tournament } from '$lib/api'
  import { addDevice, deviceSeen, loadDevices, revokeDevices, type Pairing, type TournamentDevice } from '$lib/tournaments/devices'
  import { createLiveStore } from '$lib/tournaments/live'
  import { deviceLine } from '$lib/tournaments/mode'

  let { tournamentId, format, open }: { tournamentId: string; format: Tournament['format']; open: boolean } = $props()

  // svelte-ignore state_referenced_locally
  const live = createLiveStore(tournamentId)
  const { message, devices } = live

  let paired = $state<TournamentDevice[]>([])
  let adding = $state(false)
  let pairing = $state<Pairing | null>(null)
  let addError = $state<string | null>(null)
  let revoking = $state<TournamentDevice | 'all' | null>(null)
  let error = $state<string | null>(null)
  let now = $state(new Date())

  // `_changed`: what made it run again, only there so an effect can depend on it
  const refresh = async (_changed?: unknown) => {
    paired = (await loadDevices(tournamentId)) ?? paired
    now = new Date()
  }
  onMount(() => {
    void refresh()
    // Last seen moves on its own
    const timer = setInterval(() => void refresh(), 30_000)
    return () => clearInterval(timer)
  })
  // A device coming, going or taking a match: its row follows
  $effect(() => {
    void refresh($devices)
  })
  onDestroy(() => live.destroy())

  const liveOf = (id: string) => $devices.find(d => d.id === id)
  const ownTabs = $derived($devices.filter(d => !paired.some(p => p.id === d.id)))

  async function add() {
    adding = true
    addError = null
    const r = await addDevice(tournamentId)
    if ('error' in r) addError = r.error
    else pairing = r
    await refresh()
  }

  async function revoke() {
    const target = revoking
    revoking = null
    if (!target) return
    error = (await revokeDevices(tournamentId, target === 'all' ? undefined : target.id)) ? null : 'Could not revoke. Try again.'
    await refresh()
  }
</script>

<section class="card flex flex-col gap-3 p-[18px]" aria-labelledby="onsite-devices">
  <div class="flex items-center gap-2">
    <h2 id="onsite-devices" class="grow text-body-lg font-semibold">Devices</h2>
    {#if open}<Button variant="outline" size="sm" onclick={() => void add()}><Plus size={14} aria-hidden="true" />Add device</Button>{/if}
  </div>
  {#each paired as d (d.id)}
    {@const here = liveOf(d.id)}
    <div class="flex items-center gap-3">
      <MonitorSmartphone size={18} class="shrink-0 {here?.matchKey ? 'text-live' : 'text-text-muted'}" aria-hidden="true" />
      <span class="flex min-w-0 grow flex-col">
        <span class="truncate text-label font-semibold">{d.name ?? 'Not named yet'}</span>
        <span class="text-small {here?.matchKey ? 'text-live' : 'text-text-muted'}">
          {here ? deviceLine(here, $message, format) : deviceSeen(d, now)}
        </span>
      </span>
      <Button variant="ghost" size="sm" aria-label="Revoke {d.name ?? 'this device'}" onclick={() => (revoking = d)}>Revoke</Button>
    </div>
  {/each}
  {#each ownTabs as d (d.id)}
    <div class="flex items-center gap-3">
      <MonitorSmartphone size={18} class="shrink-0 {d.matchKey ? 'text-live' : 'text-text-muted'}" aria-hidden="true" />
      <span class="flex min-w-0 flex-col">
        <span class="truncate text-label font-semibold">{d.name}</span>
        <span class="text-small {d.matchKey ? 'text-live' : 'text-text-muted'}">Signed in as you · {deviceLine(d, $message, format)}</span>
      </span>
    </div>
  {/each}
  {#if paired.length === 0 && ownTabs.length === 0}
    <p class="text-small text-text-muted">No device yet. Add one to score on a tablet at the venue.</p>
  {/if}
  {#if error}<ErrorText>{error}</ErrorText>{/if}
  {#if paired.length > 1}
    <Button variant="ghost" size="sm" class="self-start" onclick={() => (revoking = 'all')}>Revoke all devices</Button>
  {/if}
  <p class="text-small text-text-muted">
    A paired device can only keep score in this tournament: it has no account and can’t change anything else. It stays until you revoke it,
    the tournament ends or a week passes. Anyone holding it can score until then.
  </p>
</section>

{#if adding}
  <AddDeviceDialog {pairing} error={addError} onclose={() => ((adding = false), (pairing = null))} />
{/if}
{#if revoking}
  <ConfirmModal
    title={revoking === 'all' ? 'Revoke all devices?' : `Revoke ${revoking.name ?? 'this device'}?`}
    body="It leaves tournament mode at once and needs a new code to come back."
    confirmLabel="Revoke"
    danger
    onconfirm={() => void revoke()}
    oncancel={() => (revoking = null)}
  />
{/if}
