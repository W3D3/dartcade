<!--
  The Missions list (`#/play/missions/:filter?`; Missions, Tablet-Missions, Missions-Phone artboards):
  the tabs All / Mine / From friends / Popular / Completed, a difficulty filter on tablets and desktops,
  and a card per mission; a tab of Play. Behind missions.enabled: with it off the page goes to Play.
-->
<script lang="ts">
  import { Plus } from '@lucide/svelte'
  import { push, replace } from 'svelte-spa-router'
  import Layout from '$lib/components/Layout.svelte'
  import HubTabs from '$lib/components/HubTabs.svelte'
  import ErrorText from '$lib/components/ErrorText.svelte'
  import LoadingBlock from '$lib/components/LoadingBlock.svelte'
  import ConfirmModal from '$lib/components/ConfirmModal.svelte'
  import ReasonModal from '$lib/components/admin/ReasonModal.svelte'
  import SegmentedControl from '$lib/components/stats/SegmentedControl.svelte'
  import MissionCardView from '$lib/components/missions/MissionCard.svelte'
  import MissionDetailDialog from '$lib/components/missions/MissionDetailDialog.svelte'
  import StartMissionDialog from '$lib/components/missions/StartMissionDialog.svelte'
  import { Button } from '$lib/components/ui/button/index.js'
  import { Chip } from '$lib/components/ui/chip/index.js'
  import { currentUser } from '$lib/auth'
  import { flag, flagsLoaded } from '$lib/flags'
  import { isPhone } from '$lib/viewport'
  import { deleteMission, loadMissions, reportMission, setVisibility } from '$lib/missions/api'
  import {
    DIFFICULTIES,
    DIFFICULTY_LABEL,
    emptyLine,
    FILTER_LABELS,
    filterOf,
    MISSION_FILTERS,
    type CardAction,
    type Difficulty,
    type MissionCard,
  } from '$lib/missions/view'
  import { hrefs } from '$lib/routes'

  let { params = {} }: { params?: { filter?: string } } = $props()

  const enabled = flag('missions.enabled')
  $effect(() => {
    if ($flagsLoaded && !$enabled) void replace('/play')
  })

  const filter = $derived(filterOf(params.filter))
  const viewerId = $derived($currentUser?.id ?? null)
  let difficulty = $state<Difficulty | null>(null)
  let cards = $state<MissionCard[] | null>(null)
  let failed = $state(false)
  // The tab counts beside Mine and From friends (every difficulty)
  let counts = $state<{ mine: number; friends: number } | null>(null)
  let notice = $state('')

  let playing = $state<MissionCard | null>(null)
  let open = $state<MissionCard | null>(null)
  let deleting = $state<MissionCard | null>(null)
  let reporting = $state<MissionCard | null>(null)

  async function reload(): Promise<void> {
    const [f, d] = [filter, difficulty]
    const list = await loadMissions(f, d)
    if (f !== filter || d !== difficulty) return
    failed = list === null
    cards = list
  }
  async function reloadCounts(): Promise<void> {
    const [mine, friends] = await Promise.all([loadMissions('mine', null), loadMissions('friends', null)])
    counts = mine && friends ? { mine: mine.length, friends: friends.length } : null
  }
  $effect(() => {
    if (!$enabled) return
    // A new tab or difficulty: the list reloads (reload reads both)
    cards = null
    void reload()
  })
  $effect(() => {
    if ($enabled) void reloadCounts()
  })

  const tabLabel = (f: (typeof MISSION_FILTERS)[number], short = false) => {
    const n = f === 'mine' || f === 'friends' ? counts?.[f] : undefined
    const label = FILTER_LABELS[f][short ? 'short' : 'label']
    return n ? `${label} · ${n}` : label
  }

  async function act(card: MissionCard, a: CardAction): Promise<void> {
    notice = ''
    if (a.kind === 'edit') void push(hrefs.missionEdit(card.id).slice(1))
    else if (a.kind === 'delete') deleting = card
    else if (a.kind === 'report') reporting = card
    else {
      const res = await setVisibility(card, a.to)
      if ('error' in res) notice = res.error
      else if (cards) cards = cards.map(c => (c.id === card.id ? res.ok : c))
    }
  }
  async function confirmDelete(card: MissionCard): Promise<void> {
    deleting = null
    const res = await deleteMission(card.id)
    if ('error' in res) notice = res.error
    else {
      cards = cards?.filter(c => c.id !== card.id) ?? null
      void reloadCounts()
    }
  }
  async function sendReport(card: MissionCard, reason: string): Promise<void> {
    reporting = null
    const res = await reportMission(card.id, reason)
    notice = 'error' in res ? res.error : 'Thanks, a moderator will take a look.'
  }
  const play = (card: MissionCard) => ((open = null), (playing = card))
</script>

<Layout title="Play">
  <main class="flex min-h-0 grow flex-col gap-4 overflow-y-auto p-4 md:gap-[22px] md:px-8 md:py-10 xl:px-11">
    <HubTabs hub="play" />
    <header class="hidden items-end justify-between gap-6 md:flex">
      <div class="flex flex-col gap-1.5">
        <p class="text-body text-text-muted">Practice goals made of steps. Build your own, play your friends’ and beat their best times.</p>
      </div>
      <Button variant="accent" href={hrefs.missionNew()} class="h-11"><Plus size={18} />New mission</Button>
    </header>

    {#if !$enabled}
      {#if !$flagsLoaded}<LoadingBlock />{/if}
    {:else}
      <nav aria-label="Missions" class="hidden gap-1 border-b border-surface-paused md:flex">
        {#each MISSION_FILTERS as f (f)}
          <a
            href={hrefs.missions(f)}
            aria-current={f === filter ? 'page' : undefined}
            class="-mb-px flex h-[46px] items-center border-b-2 px-4 text-body no-underline
                   {f === filter
              ? 'border-accent font-semibold text-text'
              : 'border-transparent font-medium text-text-muted hover:text-text'}">{tabLabel(f)}</a
          >
        {/each}
      </nav>
      <div class="md:hidden">
        <SegmentedControl
          label="Missions"
          value={filter}
          fill
          items={MISSION_FILTERS.map(f => ({ id: f, label: tabLabel(f, true), href: hrefs.missions(f) }))}
        />
      </div>
      <div class="hidden flex-wrap items-center gap-2 md:flex" role="group" aria-label="Difficulty">
        <span class="mr-1 text-small text-text-dim">Difficulty</span>
        <Chip variant="plain" selected={difficulty === null} onclick={() => (difficulty = null)}>Any</Chip>
        {#each DIFFICULTIES as d (d)}
          <Chip variant="plain" selected={difficulty === d} onclick={() => (difficulty = d)}>{DIFFICULTY_LABEL[d]}</Chip>
        {/each}
      </div>

      {#if notice}<p role="status" class="text-label text-text-muted">{notice}</p>{/if}

      {#if failed}
        <ErrorText>Couldn't load the missions. Try again in a moment.</ErrorText>
      {:else if cards === null}
        <LoadingBlock onretry={() => void reload()} />
      {:else if cards.length === 0}
        <p class="rounded-card border border-dashed border-line-dashed px-5 py-8 text-center text-label text-text-muted">
          {emptyLine(filter, difficulty)}
        </p>
      {:else}
        <ul class="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-4 xl:grid-cols-3" aria-label="Missions list">
          {#each cards as card (card.id)}
            <li class="flex">
              <div class="flex w-full flex-col">
                <MissionCardView
                  {card}
                  {viewerId}
                  compact={$isPhone}
                  onplay={() => play(card)}
                  onopen={() => (open = card)}
                  onaction={(a: CardAction) => void act(card, a)}
                />
              </div>
            </li>
          {/each}
        </ul>
      {/if}
      <Button variant="accent" size="lg" href={hrefs.missionNew()} class="sticky bottom-0 md:hidden"><Plus size={18} />New mission</Button>
    {/if}
  </main>
</Layout>

{#if open}
  <MissionDetailDialog card={open} {viewerId} onplay={() => open && play(open)} onclose={() => (open = null)} />
{/if}
{#if playing}
  <StartMissionDialog card={playing} onclose={() => (playing = null)} />
{/if}
{#if deleting}
  {@const card = deleting}
  <ConfirmModal
    title="Delete {card.mission.name}?"
    body="Its highscores go with it. This can't be undone."
    confirmLabel="Delete"
    cancelLabel="Keep it"
    danger
    onconfirm={() => void confirmDelete(card)}
    oncancel={() => (deleting = null)}
  />
{/if}
{#if reporting}
  {@const card = reporting}
  <ReasonModal
    title="Report this mission?"
    subtitle={`Tell a moderator what is wrong with “${card.mission.name}”. You can report a mission once.`}
    confirmLabel="Send report"
    placeholder="For example: an offensive name"
    required
    onconfirm={(reason: string) => void sendReport(card, reason)}
    oncancel={() => (reporting = null)}
  />
{/if}
