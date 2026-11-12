<script lang="ts">
  // A captain picked you (Tournament-Confirm-Phone): who registered which team, when, the game,
  // the format, the check-in, who has confirmed and by when, then Can't make it or I'm in.
  import { Check, UsersRound } from '@lucide/svelte'
  import Avatar from '$lib/components/Avatar.svelte'
  import ErrorText from '$lib/components/ErrorText.svelte'
  import PageLoading from '$lib/components/PageLoading.svelte'
  import { Button } from '$lib/components/ui/button'
  import { Modal } from '$lib/components/ui/modal'
  import type { Tournament } from '$lib/api'
  import type { TournamentTeamRequest } from '$lib/api/lobby-ws'
  import { currentUser } from '$lib/auth'
  import { LOCALE } from '$lib/fmt'
  import { fullWhen, gamePill, loadTournament } from '$lib/tournaments/browse'
  import { answerRequest, shortWhen } from '$lib/tournaments/roster'

  let { request, onclose, onanswered }: { request: TournamentTeamRequest; onclose: () => void; onanswered: () => void } = $props()

  const myId = $derived($currentUser?.id ?? '')
  let t = $state<Tournament | null>(null)
  let error = $state('')
  let busy = $state(false)

  const FORMAT: Record<Tournament['format'], string> = {
    single_elimination: 'Single elimination',
    double_elimination: 'Double elimination',
    round_robin: 'Round robin',
    groups_knockout: 'Groups + knockout',
  }
  const time = (iso: string) => new Date(iso).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' })

  const facts = $derived.by(() => {
    if (!t) return []
    const checkIn = t.settings.checkInMinutes
    return [
      ['When', t.startsAt ? fullWhen(t.startsAt) : 'An organizer starts it'],
      ['Game', `${gamePill(t.gameId, t.gameConfig)} · alternate visits`],
      ['Format', `${FORMAT[t.format]} · ${t.maxEntries} teams`],
      ...(checkIn === null
        ? []
        : [
            [
              'Check-in',
              t.startsAt
                ? `${time(new Date(Date.parse(t.startsAt) - checkIn * 60_000).toISOString())}–${time(t.startsAt)}, your board`
                : `${checkIn} min once it starts, your board`,
            ],
          ]),
    ]
  })
  const slots = $derived(t?.team?.slots ?? [])
  const rosterLine = $derived(
    [
      ...slots.flatMap(s => (s.user === null || s.user.id === myId ? [] : [`${s.user.name}${s.confirmed ? ' ✓' : ''}`])),
      'you',
      ...(request.confirmBy ? [`confirm by ${shortWhen(request.confirmBy)}`] : []),
    ].join(' · '),
  )

  async function answer(accept: boolean) {
    busy = true
    error = (await answerRequest(request.tournamentId, accept)) ?? ''
    busy = false
    if (!error) onanswered()
  }

  $effect(() => {
    void loadTournament(request.tournamentId).then(res => ('error' in res ? (error = res.error) : (t = res.tournament)))
  })
</script>

<Modal {onclose} widthClass="md:max-w-md">
  <div class="flex items-center gap-3">
    <span class="flex size-11 flex-none items-center justify-center rounded-xl bg-accent-tint text-accent"><UsersRound size={22} /></span>
    <span class="flex flex-col gap-1">
      <span class="type-label-caps text-text-muted">Team request</span>
      <h2 class="type-section-title font-bold leading-none">Play the {request.tournamentName}?</h2>
    </span>
  </div>
  <p class="text-body text-ink-2">
    <b class="text-text">{request.from?.name ?? 'Your captain'}</b> registered <b class="text-text">{request.team.name}</b> for the
    {request.tournamentName} and picked you to play.
  </p>
  {#if t}
    <dl class="flex flex-col gap-2 rounded-xl border border-line-2 bg-surface-row p-3.5 text-label">
      {#each facts as [label, value] (label)}
        <div class="flex justify-between gap-3">
          <dt class="text-text-muted">{label}</dt>
          <dd class="text-right font-semibold">{value}</dd>
        </div>
      {/each}
    </dl>
    <div class="flex items-center gap-2.5 text-small text-text-muted">
      <span class="inline-flex">
        {#each slots as s, i (s.position)}
          {#if s.user}
            <span class={i > 0 ? '-ml-1.5' : ''}><Avatar name={s.user.name} face={null} size={26} /></span>
          {/if}
        {/each}
      </span>
      {rosterLine}
    </div>
  {:else if !error}
    <PageLoading />
  {/if}
  {#if error}<ErrorText>{error}</ErrorText>{/if}

  {#snippet footer()}
    <div class="grid w-full grid-cols-2 gap-2.5">
      <Button variant="outline" disabled={busy} onclick={() => void answer(false)}>Can’t make it</Button>
      <Button variant="accent" disabled={busy} onclick={() => void answer(true)}><Check size={16} />I’m in</Button>
    </div>
  {/snippet}
</Modal>
