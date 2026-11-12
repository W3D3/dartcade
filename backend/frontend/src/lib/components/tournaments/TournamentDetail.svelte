<script lang="ts">
  // A tournament's Details (the Tournaments board's hero facts, as a panel): when, game, entry and
  // format, check-in, the board rule, the spots, which friends are in, and Register, Check in or
  // Withdraw. A team tournament has Register team, and once your team is in, its players and who
  // confirmed. Organizers of an invite-link tournament also get the link to share, and of one without
  // a start time a Start now.
  import { CalendarDays, Check, Pencil, Target, User, UsersRound } from '@lucide/svelte'
  import Avatar from '$lib/components/Avatar.svelte'
  import ErrorText from '$lib/components/ErrorText.svelte'
  import { Button } from '$lib/components/ui/button'
  import { Modal } from '$lib/components/ui/modal'
  import type { Tournament } from '$lib/api'
  import { createCopy } from '$lib/clipboard.svelte'
  import { LOCALE } from '$lib/fmt'
  import { hrefs } from '$lib/routes'
  import { canWithdraw } from '$shared/tournaments/registration'
  import { isEditable } from '$shared/tournaments/state'
  import { avgTag, notEligibleLine } from '$lib/tournaments/avgLimit'
  import { REGISTRATION_NOTE, byLine, formatLong, friendsInLine, fullWhen, gameLine, spots } from '$lib/tournaments/browse'
  import { currentUser } from '$lib/auth'
  import TeamEntryCard from './TeamEntryCard.svelte'

  let {
    t,
    code,
    busy = false,
    error = '',
    onclose,
    onregister,
    onwithdraw,
    oncheckin,
    onstart,
    onregisterteam,
    onchanged,
  }: {
    t: Tournament
    /** The invite link's code Details was opened with: the tournament page needs it too. */
    code?: string
    busy?: boolean
    error?: string
    onclose: () => void
    onregister: () => void
    onwithdraw: () => void
    oncheckin: () => void
    onstart: () => void
    onregisterteam: () => void
    /** Your team's entry changed (an answer, a reminder, a new player): load the tournament again. */
    onchanged: () => void
  } = $props()

  const s = $derived(spots(t))
  const online = $derived(t.access !== 'in_person')
  const friends = $derived(t.friendsIn.slice(0, 4))
  const link = $derived(t.inviteCode && t.access === 'invite' ? `${location.origin}/${hrefs.tournamentJoin(t.inviteCode)}` : null)
  const startable = $derived(t.role !== null && online && t.status === 'open' && t.startsAt === null)
  // An invite-link tournament opens for someone without a spot only with its code
  const page = $derived(hrefs.tournament(t.id, code && t.access === 'invite' ? `code=${encodeURIComponent(code)}` : undefined))
  // Only the captain withdraws a team; a picked player answers Can't make it instead
  const mayWithdraw = $derived(canWithdraw(t.status) && (t.team === null || t.team.captainId === $currentUser?.id))
  const copy = createCopy()
  const time = (iso: string) => new Date(iso).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' })
  const checkIn = $derived.by(() => {
    const m = t.settings.checkInMinutes
    if (m === null || !online) return null
    if (t.startsAt === null) return `${m} min check-in once an organizer starts it`
    return `Check-in ${time(new Date(Date.parse(t.startsAt) - m * 60_000).toISOString())}–${time(t.startsAt)}`
  })
</script>

<Modal title={t.name} subtitle={byLine(t)} {onclose} widthClass="md:max-w-lg">
  <ul class="flex flex-col gap-2 text-label text-ink-2">
    <li class="flex items-center gap-2">
      <CalendarDays size={16} aria-hidden="true" />
      {t.startsAt ? fullWhen(t.startsAt) : 'An organizer starts it'}
    </li>
    <li class="flex items-center gap-2"><Target size={16} aria-hidden="true" />{gameLine(t.gameId, t.gameConfig, t.settings.firstTo)}</li>
    <li class="flex items-center gap-2">
      {#if t.teamSize === 1}<User size={16} aria-hidden="true" />{:else}<UsersRound size={16} aria-hidden="true" />{/if}
      {formatLong(t)}
    </li>
  </ul>

  <div class="flex flex-wrap gap-1.5">
    {#if t.settings.avgLimit}
      <span class="inline-flex h-[22px] items-center rounded-full bg-accent-tint px-2 text-caption font-bold text-accent"
        >{avgTag(t.settings.avgLimit, t.teamSize)} · 30 days</span
      >
    {/if}
    {#if t.registrationClosesAt && t.status === 'open'}
      <span class="inline-flex h-[22px] items-center rounded-full bg-surface-chip px-2 text-caption font-bold text-ink-2">
        Registration closes {fullWhen(t.registrationClosesAt)}
      </span>
    {/if}
    {#if online && !t.settings.manualScoring}
      <span class="inline-flex h-[22px] items-center rounded-full bg-ice-soft px-2 text-caption font-bold text-ice"
        >Paired board needed</span
      >
    {/if}
    {#if checkIn}
      <span class="inline-flex h-[22px] items-center rounded-full bg-surface-chip px-2 text-caption font-bold text-ink-2">{checkIn}</span>
    {/if}
  </div>

  {#if t.description}<p class="text-label text-text-muted">{t.description}</p>{/if}

  <div class="flex flex-col gap-1.5">
    <div class="flex justify-between text-small text-text-muted">
      <span><b class="text-text">{t.entries}</b> / {t.maxEntries}</span><span>{s.left}</span>
    </div>
    <span class="h-1.5 overflow-hidden rounded-[3px] bg-surface-paused">
      <span class="block h-full rounded-[3px] {s.full ? 'bg-live' : 'bg-accent'}" style="width:{s.percent}%"></span>
    </span>
  </div>

  {#if t.friendsIn.length > 0}
    <span class="flex items-center gap-2 text-small text-text-muted">
      <span class="inline-flex">
        {#each friends as f, i (f.id)}
          <span class={i > 0 ? '-ml-1.5' : ''}><Avatar name={f.name} face={{ avatar: f.avatar, userId: f.id }} size={24} /></span>
        {/each}
      </span>
      {friendsInLine(t.friendsIn.map(f => f.name))}
    </span>
  {/if}

  {#if link}
    <div class="flex items-center gap-2 rounded-md border border-line-2 p-2 pl-3 text-small">
      <span class="min-w-0 grow truncate text-ink-2">{link}</span>
      <Button variant="outline" size="sm" onclick={() => copy.copy(link)}>
        {copy.state === 'copied' ? 'Copied' : copy.state === 'failed' ? 'Copy failed' : 'Copy link'}
      </Button>
    </div>
  {/if}

  {#if t.team}
    <TeamEntryCard tournamentId={t.id} tournamentName={t.name} entry={t.team} roster {onchanged} />
  {/if}

  {#if error}<ErrorText>{error}</ErrorText>{/if}

  {#snippet footer()}
    <div class="flex w-full flex-col gap-2">
      <Button variant="outline" class="w-full" href={page}
        >{t.status === 'running' ? 'Live bracket' : t.status === 'finished' ? 'Results' : 'Tournament page'}</Button
      >
      {#if t.role && isEditable(t.status)}
        <Button variant="outline" class="w-full" href={hrefs.tournamentEdit(t.id)}><Pencil size={16} />Edit tournament</Button>
      {/if}
      {#if startable}
        <Button variant="accent" class="w-full" disabled={busy} onclick={onstart}>Start now · open check-in</Button>
      {/if}
      {#if t.access === 'in_person' && t.role}
        <Button variant="accent" class="w-full" href={hrefs.tournamentManage(t.id)}>Manage</Button>
      {:else if t.registration === 'open'}
        <Button variant="accent" class="w-full" disabled={busy} onclick={onregister}>Register</Button>
      {:else if t.registration === 'team'}
        <Button variant="accent" class="w-full" disabled={busy} onclick={onregisterteam}><UsersRound size={16} />Register a team</Button>
      {:else if t.registration === 'registered'}
        <div class="flex w-full items-center gap-3">
          <span class="flex grow items-center gap-1.5 text-label font-semibold text-accent">
            <Check size={16} />{t.checkedIn
              ? "You're checked in"
              : t.team?.status === 'pending'
                ? 'Your team’s spot is held'
                : t.team
                  ? 'Your team is registered'
                  : "You're registered"}
          </span>
          {#if t.status === 'check_in' && !t.checkedIn}
            <Button variant="accent" disabled={busy} onclick={oncheckin}>Check in</Button>
          {/if}
          {#if mayWithdraw}
            <Button variant="destructive" disabled={busy} onclick={onwithdraw}
              >{t.status === 'running' ? 'Withdraw · forfeit' : 'Withdraw'}</Button
            >
          {/if}
        </div>
      {:else}
        <Button variant="outline" class="w-full" disabled>{REGISTRATION_NOTE[t.registration]}</Button>
        {#if t.registration === 'not_eligible' && t.eligibility && t.settings.avgLimit}
          <span class="text-center text-caption text-text-muted">{notEligibleLine(t.eligibility, t.settings.avgLimit)}</span>
        {/if}
      {/if}
    </div>
  {/snippet}
</Modal>
