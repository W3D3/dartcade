<script lang="ts">
  // The organizer page's Players or Teams card (Tournament-Onsite, Tournament-Onsite-Teams): every
  // spot with its claim link or who claimed it, Unlink, and until the start Add, Paste a list,
  // rename and remove. Each change saves the whole list at once.
  import { Check, Copy, Ellipsis, Link2, Pencil, RefreshCw, Unlink } from '@lucide/svelte'
  import { DropdownMenu } from 'bits-ui'
  import ErrorText from '$lib/components/ErrorText.svelte'
  import TeamEmblem from '$lib/components/teams/TeamEmblem.svelte'
  import { Button } from '$lib/components/ui/button/index.js'
  import { buttonVariants } from '$lib/components/ui/button/button-variants.js'
  import { createCopy } from '$lib/clipboard.svelte'
  import { cn } from '$lib/utils.js'
  import {
    IN_PERSON_MAX,
    addParsed,
    addedLine,
    allClaimLinks,
    claimUrl,
    claimedLine,
    fromParticipants,
    newTeam,
    saveParticipants,
    soloEntry,
    toBody,
    reissueSpot,
    unlinkSpot,
    type DraftEntry,
    type DraftSpot,
    type ParsedLine,
    type Participants,
    type ParticipantsDraft,
  } from '$lib/tournaments/participants'
  import EditTeamDialog from './EditTeamDialog.svelte'
  import ParticipantsAdd from './ParticipantsAdd.svelte'
  import SpotNameDialog from './SpotNameDialog.svelte'
  import SpotPill from './SpotPill.svelte'

  let {
    tournamentId,
    participants = $bindable(),
    teamSize,
    max = IN_PERSON_MAX,
    editable,
  }: {
    tournamentId: string
    participants: Participants
    teamSize: number
    max?: number
    /** Until it starts the organizers change the list; Unlink and the claim links stay after. */
    editable: boolean
  } = $props()

  const teams = $derived(teamSize > 1)
  const draft = $derived(fromParticipants(participants, teamSize))
  const list = $derived(teams ? draft.teams : draft.solo)
  let error = $state('')
  let busy = $state(false)
  /** Which dialog is open: a spot's name (new or a rename), or a team (new or one on the list). */
  let naming = $state<{ entry: number | null } | null>(null)
  let editingTeam = $state<{ entry: number | null } | null>(null)
  const copy = createCopy()
  let copied = $state('')

  async function save(next: ParticipantsDraft): Promise<string> {
    busy = true
    const res = await saveParticipants(tournamentId, toBody(next, teamSize))
    busy = false
    error = res.ok ? '' : res.errors.join(' ')
    if (res.ok) participants = res.participants
    return error
  }

  function withList(entries: DraftEntry[]): ParticipantsDraft {
    return teams ? { ...draft, teams: entries } : { ...draft, solo: entries }
  }

  async function unlink(s: DraftSpot): Promise<DraftSpot | null> {
    if (!s.id) return null
    const stored = await unlinkSpot(tournamentId, s.id)
    if (!stored) {
      error = 'Couldn’t unlink the player. Try again.'
      return null
    }
    participants = stored
    return { ...s, claimedBy: null }
  }

  async function reissue(s: DraftSpot) {
    if (!s.id) return
    const stored = await reissueSpot(tournamentId, s.id)
    if (stored) participants = stored
    else error = 'Couldn’t make a new claim link. Try again.'
  }

  function lines(parsed: ParsedLine[]): string {
    const r = addParsed(draft, parsed, teamSize, max)
    void save(r.draft)
    return addedLine(r, teamSize)
  }

  function copyText(key: string, text: string) {
    copied = key
    void copy.copy(text)
  }
  const copiedNow = (key: string) => copied === key && copy.state === 'copied'
</script>

<section class="card flex min-w-0 flex-col gap-3.5 p-[18px] md:px-[22px]" aria-labelledby="onsite-list">
  <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
    <h2 id="onsite-list" class="text-body-lg font-semibold">{teams ? 'Teams' : 'Players'}</h2>
    <span class="text-small text-text-muted">{claimedLine(participants, teams)}</span>
    <span class="grow"></span>
    {#if editable}
      <ParticipantsAdd
        {teams}
        full={list.length >= max}
        onaddone={() => (teams ? (editingTeam = { entry: null }) : (naming = { entry: null }))}
        onlines={lines}
      />
    {/if}
    <Button variant="outline" size="sm" disabled={list.length === 0} onclick={() => copyText('all', allClaimLinks(participants, teams))}
      ><Copy size={16} />{copiedNow('all') ? 'Copied' : 'Copy all claim links'}</Button
    >
  </div>

  {#if list.length === 0}
    <p class="text-label text-text-muted">No {teams ? 'teams' : 'players'} yet. Add them, or paste a list.</p>
  {:else if !teams}
    <ol class="flex flex-col p-0">
      {#each draft.solo as e, i (e.key)}
        {@const s = e.players[0]}
        <li class="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-line py-2.5 last:border-0">
          <span class="w-5 text-right text-small font-semibold text-text-dim tabular-nums">{i + 1}</span>
          <span
            aria-hidden="true"
            class="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-chip text-label font-bold text-ink-2"
            >{s.name.charAt(0).toUpperCase()}</span
          >
          <span class="min-w-0 grow truncate text-label font-semibold">{s.name}</span>
          <SpotPill state={s.claimedBy ? 'claimed' : 'guest'} by={s.claimedBy?.name} />
          {#if s.claimedBy}
            <Button variant="outline" size="sm" onclick={() => unlink(s)}>Unlink</Button>
          {:else}
            <Button variant="outline" size="sm" onclick={() => copyText(s.key, claimUrl(s.claimCode ?? ''))}
              ><Link2 size={14} />{copiedNow(s.key) ? 'Copied' : 'Copy claim link'}</Button
            >
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="New claim link for {s.name}"
              title="New claim link"
              onclick={() => reissue(s)}><RefreshCw size={14} /></Button
            >
          {/if}
          {#if editable}
            <DropdownMenu.Root>
              <DropdownMenu.Trigger class={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))} aria-label="More for {s.name}"
                ><Ellipsis size={16} /></DropdownMenu.Trigger
              >
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  align="end"
                  sideOffset={6}
                  class="z-60 flex min-w-[160px] flex-col gap-[2px] rounded-xl border border-line-popover bg-surface-hover p-[6px] [box-shadow:0_18px_44px_rgba(0,0,0,0.55)] outline-none"
                >
                  <DropdownMenu.Item
                    disabled={!!s.claimedBy}
                    onSelect={() => (naming = { entry: i })}
                    class="flex h-10 cursor-pointer items-center rounded-sm px-[10px] text-label outline-none data-disabled:opacity-50 data-highlighted:bg-surface-paused"
                    >{s.claimedBy ? 'Rename (unlink first)' : 'Rename'}</DropdownMenu.Item
                  >
                  <DropdownMenu.Item
                    onSelect={() => save(withList(draft.solo.filter((_, j) => j !== i)))}
                    class="flex h-10 cursor-pointer items-center rounded-sm px-[10px] text-label text-danger-text outline-none data-highlighted:bg-surface-paused"
                    >Remove</DropdownMenu.Item
                  >
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          {/if}
        </li>
      {/each}
    </ol>
  {:else}
    <ul class="flex flex-col p-0">
      {#each draft.teams as t, i (t.key)}
        <li
          class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-b border-line py-3 last:border-0 md:grid-cols-[220px_minmax(0,1fr)_auto] md:gap-4"
        >
          <span class="flex min-w-0 items-center gap-2.5">
            <TeamEmblem tag={t.tag} color={t.color} size={36} />
            <span class="flex min-w-0 flex-col">
              <span class="truncate text-label font-semibold">{t.name}</span>
              <span class="text-caption text-text-dim">{t.players.filter(p => p.claimedBy).length} of {teamSize} claimed</span>
            </span>
          </span>
          <span class="col-span-2 row-start-2 flex min-w-0 flex-wrap gap-2 md:col-span-1 md:col-start-2 md:row-start-1">
            {#each t.players as p (p.key)}
              <span class="inline-flex min-w-0 items-center gap-2 rounded-pill bg-surface-paused py-1 pr-1 pl-1.5 text-small">
                <span
                  aria-hidden="true"
                  class="flex size-6 shrink-0 items-center justify-center rounded-full bg-surface-chip text-caption font-bold text-ink-2"
                  >{p.name.charAt(0).toUpperCase()}</span
                >
                <span class="truncate font-semibold">{p.name}</span>
                <span class="text-text-dim">{p.claimedBy ? `@${p.claimedBy.name}` : 'Guest'}</span>
                {#if p.claimedBy}
                  <Button variant="ghost" size="icon-sm" aria-label="Unlink {p.name}" title="Unlink" onclick={() => unlink(p)}
                    ><Unlink size={14} /></Button
                  >
                {:else}
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Copy {p.name}’s claim link"
                    title={copiedNow(p.key) ? 'Copied' : 'Copy claim link'}
                    onclick={() => copyText(p.key, claimUrl(p.claimCode ?? ''))}
                    >{#if copiedNow(p.key)}<Check size={14} />{:else}<Link2 size={14} />{/if}</Button
                  >
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="New claim link for {p.name}"
                    title="New claim link"
                    onclick={() => reissue(p)}><RefreshCw size={14} /></Button
                  >
                {/if}
              </span>
            {/each}
            {#each { length: Math.max(0, teamSize - t.players.length) } as _, j (j)}<SpotPill state="empty" />{/each}
          </span>
          {#if editable}
            <Button
              variant="ghost"
              size="sm"
              aria-label="Edit {t.name}"
              class="col-start-2 row-start-1 md:col-start-3"
              onclick={() => (editingTeam = { entry: i })}><Pencil size={14} /></Button
            >
          {/if}
        </li>
      {/each}
    </ul>
  {/if}

  {#if participants.startBlocker && list.length > 0 && editable}<span class="text-caption text-text-dim">{participants.startBlocker}</span
    >{/if}
  {#if error}<ErrorText>{error}</ErrorText>{/if}
  {#if busy}<span class="sr-only" role="status">Saving…</span>{/if}
</section>

{#if naming}
  {@const at = naming.entry}
  <SpotNameDialog
    title={at === null ? 'Add player' : 'Rename player'}
    name={at === null ? '' : draft.solo[at].players[0].name}
    onclose={() => (naming = null)}
    onsave={async (name: string) => {
      const entries =
        at === null
          ? [...draft.solo, soloEntry(name)]
          : draft.solo.map((e, j) => (j === at ? { ...e, name, players: [{ ...e.players[0], name }] } : e))
      if (!(await save(withList(entries)))) naming = null
    }}
  />
{/if}

{#if editingTeam}
  {@const at = editingTeam.entry}
  <EditTeamDialog
    team={at === null ? newTeam(draft.teams.length) : draft.teams[at]}
    n={(at ?? draft.teams.length) + 1}
    perTeam={teamSize}
    onclose={() => (editingTeam = null)}
    onsave={async (t: DraftEntry) => {
      const entries = at === null ? [...draft.teams, t] : draft.teams.map((e, j) => (j === at ? t : e))
      if (!(await save(withList(entries)))) editingTeam = null
    }}
    onremove={async () => {
      if (at === null || !(await save(withList(draft.teams.filter((_, j) => j !== at))))) editingTeam = null
    }}
    onunlink={unlink}
  />
{/if}
