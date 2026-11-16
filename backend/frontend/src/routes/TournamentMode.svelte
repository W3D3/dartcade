<script lang="ts">
  // Tournament mode (Tournament-Mode, #/tournament-mode/:id): a venue device's full-screen view of
  // an in-person tournament, with no nav, lobby, friends or toasts. The bar (name, format,
  // progress, this device), Matches / Bracket / Players and how many devices are in tournament
  // mode. Scorekeeping only: starting and every other organizer action stay on the organizer page,
  // and there is no Exit (a device goes when an organizer revokes it, the tournament ends or its
  // session expires). A venue device holds a session paired with a code (no account; its name is
  // asked on first open and kept by the server); an organizer signed in may open it too (the name
  // is kept by this browser, Q15). Playing a match (Play) comes with #617.
  import { onMount } from 'svelte'
  import { MonitorSmartphone, TabletSmartphone, Trophy } from '@lucide/svelte'
  import { push } from 'svelte-spa-router'
  import PageLoading from '$lib/components/PageLoading.svelte'
  import EmptyState from '$lib/components/lobby/EmptyState.svelte'
  import SegmentedControl from '$lib/components/stats/SegmentedControl.svelte'
  import SpotNameDialog from '$lib/components/tournaments/SpotNameDialog.svelte'
  import BracketTab from '$lib/components/tournaments/live/BracketTab.svelte'
  import PlayersList from '$lib/components/tournaments/live/PlayersList.svelte'
  import ModeMatchCard from '$lib/components/tournaments/mode/ModeMatchCard.svelte'
  import type { Tournament } from '$lib/api'
  import { flag, flagsLoaded } from '$lib/flags'
  import { hrefs } from '$lib/routes'
  import { loadTournament } from '$lib/tournaments/browse'
  import { deviceSessionStore, loadDeviceSession, renameDeviceSession, type DeviceSession } from '$lib/tournaments/devices'
  import type { Device, LiveMatch, LiveMessage } from '$lib/tournaments/live'
  import { barLine, DEVICE_NAME_MAX, deviceName, matchGroups, openMode, rememberDeviceName, type ModeSession } from '$lib/tournaments/mode'

  let { params }: { params: { id: string } } = $props()

  type Tab = 'matches' | 'bracket' | 'players'
  const TABS: { id: Tab; label: string }[] = [
    { id: 'matches', label: 'Matches' },
    { id: 'bracket', label: 'Bracket' },
    { id: 'players', label: 'Players' },
  ]
  let tab = $state<Tab>('matches')

  const enabled = flag('tournaments.enabled')
  let t = $state<Tournament | null | undefined>(undefined)
  let name = $state<string | null>(deviceName())
  let naming = $state(false)
  let mode = $state<ModeSession | null>(null)

  // The session this browser holds as a venue device; null for a signed-in organizer. Undefined while it loads
  let device = $state<DeviceSession | null | undefined>(undefined)

  onMount(async () => {
    device = await loadDeviceSession()
    deviceSessionStore.set(device)
    if (device) name = device.name
    const r = await loadTournament(params.id)
    t = 'tournament' in r ? r.tournament : null
  })

  // The server decides what a device may do: it sees only its own tournament. A signed-in organizer needs the role
  const allowed = $derived(device ? device.tournamentId === params.id : !!t?.role && t.play === 'in_person')
  // The socket opens once the device has a name; it stays open while this tab is in tournament mode
  $effect(() => {
    if (allowed && name && !mode) mode = openMode(params.id, name)
  })

  let m = $state<LiveMessage | null>(null)
  let devices = $state<Device[]>([])
  let gone = $state(false)
  $effect(() => {
    if (!mode) return
    const stops = [
      mode.live.message.subscribe(v => (m = v)),
      mode.live.devices.subscribe(v => (devices = v)),
      mode.live.gone.subscribe(v => (gone = v)),
    ]
    return () => {
      for (const stop of stops) stop()
    }
  })
  const myId = $derived(mode?.deviceId ?? null)
  const groups = $derived(m ? matchGroups(m) : null)

  function saveName(next: string) {
    const clean = next.trim().slice(0, DEVICE_NAME_MAX)
    if (device) void renameDeviceSession(clean)
    else rememberDeviceName(clean)
    name = clean
    naming = false
    mode?.rename(clean)
  }

  function continueMatch(match: LiveMatch) {
    if (!mode || !match.game) return
    mode.hold(match.key)
    void push(hrefs.session(match.game.sessionId).slice(1))
  }
</script>

{#snippet heading(title: string, hint = '')}
  <div class="flex items-baseline gap-2.5">
    <h2 class="type-section-title font-bold">{title}</h2>
    {#if hint}<span class="text-small text-text-muted">{hint}</span>{/if}
  </div>
{/snippet}

<div class="flex h-dvh flex-col bg-bg text-text">
  {#if (!device && !$flagsLoaded) || device === undefined || t === undefined}
    <PageLoading />
  {:else if (!device && !$enabled) || !t || !allowed || gone}
    <main class="grid grow place-items-center p-6">
      <EmptyState
        title="Not available"
        text={gone && device
          ? 'This device was removed from the tournament, or the tournament is over. Ask an organizer for a new code.'
          : 'Tournament mode is for the organizers of an in-person tournament, and for devices they paired.'}
      >
        {#snippet icon()}<Trophy size={24} />{/snippet}
      </EmptyState>
    </main>
  {:else if !name}
    <SpotNameDialog
      title="Name this device"
      subtitle="Other devices at the venue see it by this name, like “Tablet · Bar”."
      max={DEVICE_NAME_MAX}
      onsave={saveName}
      onclose={() => (device ? undefined : void push(hrefs.tournamentManage(params.id).slice(1)))}
    />
  {:else}
    <header
      class="flex min-h-[60px] shrink-0 flex-wrap items-center gap-x-3.5 gap-y-2 border-b border-line-2 bg-surface-1 px-4 py-2 md:px-5"
    >
      <span
        class="inline-flex h-[30px] items-center gap-1.5 rounded-pill bg-accent px-3 text-caption font-extrabold tracking-wider text-bg"
      >
        <MonitorSmartphone size={14} aria-hidden="true" />TOURNAMENT MODE
      </span>
      <span class="flex min-w-0 grow basis-60 flex-col leading-tight">
        <span class="truncate type-section-title font-bold">{t.name}</span>
        {#if m}<span class="truncate text-small text-text-muted">{barLine(t, m)}</span>{/if}
      </span>
      <button
        type="button"
        class="inline-flex h-11 items-center gap-1.5 rounded-md px-2 text-label text-text-muted hover:text-text"
        aria-label="Rename this device: {name}"
        onclick={() => (naming = true)}
      >
        <TabletSmartphone size={16} aria-hidden="true" />{name}
      </button>
    </header>

    <main class="flex min-h-0 grow flex-col gap-4 overflow-y-auto p-4 md:px-6 md:py-5">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="w-full sm:w-[360px]">
          <SegmentedControl
            label="Tournament mode"
            items={TABS}
            value={tab}
            fill
            onchange={id => (tab = TABS.find(x => x.id === id)?.id ?? 'matches')}
          />
        </div>
        <span class="flex items-center gap-2 text-small text-text-muted">
          <MonitorSmartphone size={16} aria-hidden="true" />{devices.length}
          {devices.length === 1 ? 'device' : 'devices'} in tournament mode
        </span>
      </div>

      {#if !m || !groups}
        <PageLoading />
      {:else if tab === 'bracket'}
        <BracketTab {m} {t} />
      {:else if tab === 'players'}
        <PlayersList {m} />
      {:else if m.status === 'open'}
        <section class="card flex flex-col items-start gap-2 p-5 md:max-w-xl" aria-labelledby="mode-wait">
          <h2 id="mode-wait" class="type-section-title font-bold">Waiting for the organizers</h2>
          <p class="text-body text-ink-2">The tournament has not started. The bracket shows here as soon as an organizer starts it.</p>
        </section>
      {:else}
        <div class="grid min-w-0 grid-cols-1 items-start gap-[22px] lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
          <div class="flex min-w-0 flex-col gap-3">
            {@render heading('Ready to play', 'tap Play on the device you’re throwing at')}
            {#each groups.ready as match (match.key)}
              <ModeMatchCard {m} {match} format={t.format} gameId={t.gameId} {devices} deviceId={myId} oncontinue={continueMatch} />
            {:else}
              <p class="text-label text-text-muted">No match is waiting for its players.</p>
            {/each}
            {#if groups.upNext.length > 0}
              {@render heading('Up next')}
              {#each groups.upNext as match (match.key)}
                <ModeMatchCard {m} {match} format={t.format} gameId={t.gameId} {devices} deviceId={myId} oncontinue={continueMatch} />
              {/each}
            {/if}
          </div>
          <div class="flex min-w-0 flex-col gap-3">
            {@render heading('Playing now')}
            {#each groups.playing as match (match.key)}
              <ModeMatchCard {m} {match} format={t.format} gameId={t.gameId} {devices} deviceId={myId} oncontinue={continueMatch} />
            {:else}
              <p class="text-label text-text-muted">No match is being played.</p>
            {/each}
            {#if groups.finished.length > 0}
              {@render heading('Finished')}
              {#each groups.finished as match (match.key)}
                <ModeMatchCard {m} {match} format={t.format} gameId={t.gameId} {devices} deviceId={myId} oncontinue={continueMatch} />
              {/each}
            {/if}
          </div>
        </div>
      {/if}
    </main>

    {#if naming}
      <SpotNameDialog title="Rename this device" {name} max={DEVICE_NAME_MAX} onsave={saveName} onclose={() => (naming = false)} />
    {/if}
  {/if}
</div>
