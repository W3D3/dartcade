<script lang="ts">
  // Register a team (Tournament-Register-Team): 1 · Which team? (yours to register, one someone
  // else captains, or New team), 2 · Who plays? with each player's 30-day average and the team
  // average against the limit, the note about held spots, and Send request. Only the captain sends.
  import { Check, Clock, Crown, Plus } from '@lucide/svelte'
  import Avatar from '$lib/components/Avatar.svelte'
  import ErrorText from '$lib/components/ErrorText.svelte'
  import PageLoading from '$lib/components/PageLoading.svelte'
  import TeamEmblem from '$lib/components/teams/TeamEmblem.svelte'
  import { Button } from '$lib/components/ui/button'
  import { Modal } from '$lib/components/ui/modal'
  import type { Tournament } from '$lib/api'
  import { currentUser } from '$lib/auth'
  import { hrefs } from '$lib/routes'
  import { entryLabel, spots } from '$lib/tournaments/browse'
  import {
    holdNote,
    limitLine,
    loadTeamOptions,
    pickRows,
    registerTeam,
    sendLabel,
    sendProblem,
    toAsk,
    type TeamOption,
  } from '$lib/tournaments/roster'

  let { t, code, onclose, onregistered }: { t: Tournament; code?: string; onclose: () => void; onregistered: (t: Tournament) => void } =
    $props()

  const myId = $derived($currentUser?.id ?? '')
  let teams = $state<TeamOption[] | null>(null)
  let failed = $state(false)
  let teamId = $state<string | null>(null)
  let picked = $state<string[]>([])
  let busy = $state(false)
  let error = $state('')

  const team = $derived(teams?.find(o => o.id === teamId) ?? null)
  const rows = $derived(team ? pickRows(t, team, picked, myId) : [])
  const limit = $derived(team ? limitLine(t, team, picked) : null)
  const problem = $derived(team ? sendProblem(t, team, picked, myId) : 'Pick a team')
  const asked = $derived(team ? toAsk(team, picked, myId) : [])
  const s = $derived(spots(t))
  const noun = $derived(t.teamSize === 1 ? 'players' : 'teams')

  /** A team's own players first: the captain, then whoever can play, up to the team size. */
  function choose(o: TeamOption) {
    teamId = o.id
    error = ''
    const free = pickRows(t, o, [], myId).filter(r => !r.disabled)
    picked = o.captainId === myId ? free.slice(0, t.teamSize).map(r => r.member.user.id) : []
  }

  function toggle(id: string) {
    picked = picked.includes(id) ? picked.filter(p => p !== id) : [...picked, id]
  }

  async function send() {
    if (!team) return
    busy = true
    const res = await registerTeam(t.id, team.id, picked, code)
    busy = false
    if ('error' in res) error = res.error
    else onregistered(res.tournament)
  }

  $effect(() => {
    void loadTeamOptions(t.id).then(o => {
      failed = o === null
      teams = o
      const first = o?.find(x => x.captainId === myId && !x.entered) ?? o?.[0]
      if (first) choose(first)
    })
  })
</script>

<Modal title="Register a team" subtitle="{t.name} · {entryLabel(t.teamSize).toLowerCase()}" {onclose} widthClass="md:max-w-[760px]">
  {#if teams === null}
    {#if failed}<ErrorText>Couldn't load your teams. Try again in a moment.</ErrorText>{:else}<PageLoading />{/if}
  {:else}
    <section class="flex flex-col gap-2.5" aria-labelledby="reg-which">
      <h3 id="reg-which" class="type-label-caps text-text-muted">1 · Which team?</h3>
      <div class="grid gap-2.5 md:grid-cols-3" role="radiogroup" aria-label="Which team?">
        {#each teams as o (o.id)}
          {@const captain = o.members.find(m => m.user.id === o.captainId)}
          <button
            type="button"
            role="radio"
            aria-checked={o.id === teamId}
            onclick={() => choose(o)}
            class="flex items-center gap-3 rounded-popover border p-3 text-left
                   {o.id === teamId ? 'border-accent-line bg-card-active' : 'border-line-2 bg-surface-row hover:border-line-chip'}"
          >
            <TeamEmblem tag={o.tag} color={o.color} size={42} />
            <span class="flex min-w-0 flex-1 flex-col gap-0.5">
              <span class="truncate text-body font-semibold">{o.name}</span>
              <span class="text-small text-text-muted">
                {o.entered
                  ? 'Registered already'
                  : o.captainId === myId
                    ? `Captain · ${o.members.length} players`
                    : `${captain?.user.name ?? 'Someone'} is captain`}
              </span>
            </span>
          </button>
        {/each}
        <a
          href={hrefs.tournaments('teams')}
          class="flex items-center gap-3 rounded-popover border border-dashed border-line-chip p-3 text-body font-semibold text-ink-2 no-underline hover:text-text"
        >
          <span class="flex size-[42px] items-center justify-center rounded-xl border-[1.5px] border-dashed border-line-chip"
            ><Plus size={18} /></span
          >
          New team
        </a>
      </div>
      {#if teams.length === 0}
        <p class="text-small text-text-muted">You're in no team yet. Make one and invite your teammates first.</p>
      {/if}
    </section>

    {#if team}
      <section class="flex flex-col gap-2.5" aria-labelledby="reg-who">
        <div class="flex flex-wrap items-baseline justify-between gap-2">
          <h3 id="reg-who" class="type-label-caps text-text-muted">
            2 · Who plays? <span class="font-normal normal-case tracking-normal">pick {t.teamSize}</span>
          </h3>
          {#if limit}
            <span class="text-small text-text-muted"
              >{limit.lead}<b class={limit.fits ? 'text-accent' : 'text-live'}>{limit.value}</b>{limit.tail}</span
            >
          {/if}
        </div>
        <ul class="flex flex-col gap-2">
          {#each rows as row (row.member.user.id)}
            <li>
              <button
                type="button"
                role="checkbox"
                aria-checked={row.picked}
                disabled={row.disabled}
                onclick={() => toggle(row.member.user.id)}
                class="flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left disabled:cursor-not-allowed
                       {row.picked ? 'border-accent-line bg-card-active' : 'border-surface-inset'} {row.disabled && !row.picked
                  ? 'opacity-60'
                  : ''}"
              >
                <span
                  class="flex size-[22px] flex-none items-center justify-center rounded-md {row.picked
                    ? 'bg-accent text-accent-fg'
                    : 'border-2 border-line-chip'}"
                >
                  {#if row.picked}<Check size={14} strokeWidth={3} />{/if}
                </span>
                <Avatar name={row.member.user.name} face={{ avatar: row.member.user.avatar, userId: row.member.user.id }} size={34} />
                <span class="flex min-w-0 flex-1 flex-col">
                  <span class="flex items-center gap-1.5 text-body font-semibold">
                    {row.member.user.name}{#if row.captain}<Crown size={14} class="text-gold" aria-label="captain" />{/if}
                  </span>
                  <span class="text-small text-text-muted">{row.detail}</span>
                </span>
              </button>
            </li>
          {/each}
          <!-- Guests come with #612: the row is there, switched off -->
          <li class="flex items-center gap-3 rounded-xl border border-dashed border-surface-inset px-3 py-2.5 text-ink-faint">
            <span class="flex size-[34px] flex-none items-center justify-center rounded-full border-[1.5px] border-dashed border-line-chip"
              ><Plus size={16} /></span
            >
            <span class="flex flex-col">
              <span class="text-body font-semibold">Play with a guest</span>
              <span class="text-small">Guests aren’t allowed in this tournament</span>
            </span>
          </li>
        </ul>
      </section>

      {#if team.captainId === myId && !team.entered}
        <p class="flex gap-3 rounded-xl border border-accent-line bg-card-active px-4 py-3.5 text-label text-ink-2">
          <Clock size={18} class="mt-px flex-none text-accent" aria-hidden="true" />
          <span>{holdNote(asked, t.registrationClosesAt)}</span>
        </p>
      {/if}
    {/if}
    {#if error}<ErrorText>{error}</ErrorText>{/if}
  {/if}

  {#snippet footer()}
    <div class="flex w-full flex-wrap items-center gap-2.5">
      <span class="text-small text-text-muted">{t.entries} of {t.maxEntries} {noun} · {s.left.toLowerCase()}</span>
      <Button variant="ghost" class="ml-auto" onclick={onclose}>Cancel</Button>
      <Button variant="accent" disabled={busy || problem !== null} title={problem ?? undefined} onclick={() => void send()}>
        {sendLabel(asked)}
      </Button>
    </div>
  {/snippet}
</Modal>
