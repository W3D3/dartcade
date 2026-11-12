<script lang="ts">
  // The picked team (Tournaments-Teams): its record, players with their rating, pending invites,
  // the tournaments it entered, and Leave. The captain also gets Edit, Invite players, Make captain,
  // Remove and Cancel invite; the captain's Leave waits until someone else is captain.
  import { Crown, UserPlus } from '@lucide/svelte'
  import Avatar from '$lib/components/Avatar.svelte'
  import ErrorText from '$lib/components/ErrorText.svelte'
  import { Button } from '$lib/components/ui/button/index.js'
  import { dayMonth, weekday } from '$lib/fmt'
  import { cancelInvite, makeCaptain, removeMember, type Team } from '$lib/teams/actions'
  import {
    averageText,
    bestPlaceText,
    invitedLine,
    nextTournament,
    ratingText,
    recordText,
    tournamentDate,
    tournamentResult,
  } from '$lib/teams/view'
  import { TEAM_LIMITS } from '$shared/teams.js'
  import TeamEmblem from './TeamEmblem.svelte'

  let {
    team,
    myId,
    now,
    onchanged,
    onedit,
    oninvite,
  }: { team: Team; myId: string; now: Date; onchanged: () => void; onedit: () => void; oninvite: () => void } = $props()

  const captain = $derived(team.captainUserId === myId)
  const next = $derived(nextTournament(team))
  const alone = $derived(team.members.length === 1)
  let busy = $state(false)
  let error = $state('')

  async function run(call: () => Promise<string | null>) {
    busy = true
    error = (await call()) ?? ''
    busy = false
    if (!error) onchanged()
  }

  const TONE = { gold: 'text-gold', silver: 'text-ink-2', pending: 'text-warn', dim: 'text-text-muted' } as const
</script>

<section aria-label={team.name} class="card flex min-w-0 flex-col gap-[18px] p-5 md:px-[26px] md:py-6">
  <div class="flex flex-wrap items-center gap-[18px]">
    <TeamEmblem tag={team.tag} color={team.color} size={72} />
    <span class="flex min-w-0 flex-1 flex-col gap-1.5">
      <h2 class="type-checkout uppercase">{team.name} <span class="text-text-dim">[{team.tag}]</span></h2>
      <span class="text-label font-normal text-text-muted"
        >Created {dayMonth(new Date(team.createdAt))} · team avg {averageText(team.average)} (30 days)</span
      >
    </span>
    {#if captain}
      <span class="flex gap-2.5">
        <Button variant="outline" size="sm" onclick={onedit}>Edit</Button>
        <Button
          variant="accent"
          size="sm"
          onclick={oninvite}
          disabled={team.members.length + team.invites.length >= TEAM_LIMITS.maxPlayers}
        >
          <UserPlus size={16} />Invite players
        </Button>
      </span>
    {/if}
  </div>

  <dl class="grid grid-cols-2 gap-2.5 md:grid-cols-4">
    {#snippet tile(label: string, value: string, sub: string)}
      <div class="flex flex-col gap-[3px] rounded-lg border border-surface-paused bg-surface-1 px-3.5 py-3">
        <dt class="type-eyebrow text-text-dim">{label}</dt>
        <dd class="font-display text-section-title leading-none font-bold">{value}</dd>
        <dd class="text-caption text-text-muted">{sub}</dd>
      </div>
    {/snippet}
    {@render tile('Matches', recordText(team), 'won–lost')}
    {@render tile('Tournaments', String(team.record.tournaments), bestPlaceText(team))}
    {@render tile('Team avg', averageText(team.average), '3-dart, last 30 d')}
    {@render tile('Next', next?.startsAt ? weekday(new Date(next.startsAt)) : '–', next?.name ?? 'nothing planned')}
  </dl>

  <div>
    <h3 class="mb-1 text-label font-semibold">
      Players <span class="font-normal text-text-muted">{team.members.length} of {TEAM_LIMITS.maxPlayers}</span>
    </h3>
    <ul class="p-0">
      {#each team.members as m (m.user.id)}
        {@const isCaptain = m.user.id === team.captainUserId}
        <li class="flex flex-wrap items-center gap-x-3.5 gap-y-2 border-t border-surface-paused py-3">
          <Avatar
            name={m.user.name}
            face={{ avatar: m.user.avatar, userId: m.user.id }}
            size={40}
            tone={m.user.id === myId ? 'accent' : 'default'}
          />
          <span class="flex min-w-0 flex-1 flex-col gap-0.5">
            <span class="flex items-center gap-2 text-body-lg font-semibold">
              {m.user.name}{m.user.id === myId ? ' (you)' : ''}
              {#if isCaptain}
                <span class="inline-flex items-center gap-1 rounded-chip bg-warn-icon px-2 py-0.5 type-pill text-gold"
                  ><Crown size={12} />Captain</span
                >
              {/if}
            </span>
            <span class="text-small text-text-muted"
              >{isCaptain ? 'Registers the team and picks who plays' : `Joined ${dayMonth(new Date(m.joinedAt))}`}</span
            >
          </span>
          <span class="w-[90px] text-right font-display text-lead leading-none font-bold text-ink-2" title="1v1 rating"
            >{ratingText(m.rating)}</span
          >
          {#if captain && !isCaptain}
            <Button variant="ghost" size="sm" disabled={busy} onclick={() => void run(() => makeCaptain(team.id, m.user.id))}
              >Make captain</Button
            >
            <Button
              variant="ghost"
              size="sm"
              class="text-live-text"
              disabled={busy}
              onclick={() => void run(() => removeMember(team.id, m.user.id))}
            >
              Remove
            </Button>
          {/if}
        </li>
      {/each}
      {#each team.invites as i (i.id)}
        <li class="flex flex-wrap items-center gap-x-3.5 gap-y-2 border-t border-surface-paused py-3 opacity-70">
          <Avatar name={i.user.name} face={{ avatar: i.user.avatar, userId: i.user.id }} size={40} />
          <span class="flex min-w-0 flex-1 flex-col gap-0.5">
            <span class="flex items-center gap-2 text-body-lg font-semibold">
              {i.user.name}<span class="rounded-chip bg-surface-paused px-2 py-0.5 type-pill text-text-muted">Invited</span>
            </span>
            <span class="text-small text-text-muted">{invitedLine(i, now)}</span>
          </span>
          <span class="w-[90px] text-right font-display text-lead leading-none font-bold text-ink-2">{ratingText(i.rating)}</span>
          {#if captain}
            <Button variant="ghost" size="sm" disabled={busy} onclick={() => void run(() => cancelInvite(team.id, i.id))}
              >Cancel invite</Button
            >
          {/if}
        </li>
      {/each}
    </ul>
  </div>

  {#if team.tournaments.length > 0}
    <div>
      <h3 class="text-label font-semibold">Tournaments</h3>
      <ul class="p-0">
        {#each team.tournaments as t (t.id)}
          {@const result = tournamentResult(t)}
          <li class="flex items-center gap-3 border-t border-surface-paused py-2.5 text-label font-normal">
            <span class="min-w-0 flex-1 truncate">{t.name}</span>
            <span class="text-text-muted">{tournamentDate(t)}</span>
            <span class="w-[90px] text-right font-display text-lead leading-none font-bold {TONE[result.tone]}">{result.text}</span>
          </li>
        {/each}
      </ul>
    </div>
  {/if}

  {#if error}<ErrorText>{error}</ErrorText>{/if}
  <div class="flex flex-wrap items-center gap-2.5 border-t border-surface-paused pt-1.5">
    <Button
      variant="ghost"
      size="sm"
      class="text-live-text"
      disabled={busy || (captain && !alone)}
      onclick={() => void run(() => removeMember(team.id, myId))}>{captain && alone ? 'Leave and delete team' : 'Leave team'}</Button
    >
    {#if captain && !alone}
      <span class="ml-auto text-caption text-text-dim">Captains can’t leave without handing over the captain role.</span>
    {/if}
  </div>
</section>
