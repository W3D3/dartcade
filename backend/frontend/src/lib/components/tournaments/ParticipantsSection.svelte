<script lang="ts">
  // Tournament-Create's Participants (in person): the solo list or the team cards, two per row,
  // with Add, Paste a list and Import CSV. Players a smaller team size would drop stay in the draft,
  // dimmed, until the tournament is saved. Edits `draft` in place; the page saves it with the form.
  import { Pencil, Plus, TriangleAlert, X } from '@lucide/svelte'
  import { Button } from '$lib/components/ui/button/index.js'
  import { Input } from '$lib/components/ui/input/index.js'
  import {
    addParsed,
    addedLine,
    draftBlocker,
    fullestTeam,
    isClaimed,
    newTeam,
    overflow,
    soloEntry,
    spot,
    spotState,
    unlinkSpot,
    type DraftEntry,
    type DraftSpot,
    type ParsedLine,
    type ParticipantsDraft,
  } from '$lib/tournaments/participants'
  import { SPOT_NAME_MAX } from '$shared/tournaments/participants'
  import { TEAM_LIMITS } from '$shared/teams'
  import EditTeamDialog from './EditTeamDialog.svelte'
  import ParticipantsAdd from './ParticipantsAdd.svelte'
  import SpotPill from './SpotPill.svelte'

  let {
    draft = $bindable(),
    perTeam,
    max,
    tournamentId,
    disabled = false,
    onkeep,
  }: {
    draft: ParticipantsDraft
    /** Players per team; 1 is solo. */
    perTeam: number
    max: number
    /** The stored tournament, for Unlink; none while it is new. */
    tournamentId?: string
    disabled?: boolean
    /** Keep the team size that drops nobody. */
    onkeep: (perTeam: number) => void
  } = $props()

  const teams = $derived(perTeam > 1)
  const list = $derived(teams ? draft.teams : draft.solo)
  const dropped = $derived(teams ? overflow(draft.teams, perTeam) : [])
  const fullest = $derived(fullestTeam(draft.teams))
  const blocker = $derived(draftBlocker(draft, perTeam))
  let editing = $state<number | null>(null)

  const rows = (t: DraftEntry) => Math.max(perTeam, t.players.length)

  function setPlayer(t: DraftEntry, i: number, name: string) {
    while (t.players.length <= i) t.players.push(spot())
    t.players[i].name = name
  }

  function lines(parsed: ParsedLine[]): string {
    const r = addParsed(draft, parsed, perTeam, max)
    draft = r.draft
    return addedLine(r, perTeam)
  }

  function addOne() {
    if (teams) draft.teams.push(newTeam(draft.teams.length))
    else draft.solo.push(soloEntry(''))
  }

  async function unlink(s: DraftSpot): Promise<DraftSpot | null> {
    if (!tournamentId || !s.id) return null
    const stored = await unlinkSpot(tournamentId, s.id)
    if (!stored) return null
    for (const e of [...draft.solo, ...draft.teams]) for (const p of e.players) if (p.id === s.id) p.claimedBy = null
    return { ...s, claimedBy: null }
  }

  const and = (names: string[]) => (names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`)
</script>

<div class="flex flex-col gap-3.5 rounded-xl border border-accent-line bg-accent-tint p-3.5 md:px-4">
  <div class="flex flex-wrap items-baseline gap-x-2">
    <span class="text-label font-semibold">Participants</span>
    <span class="text-caption text-text-dim">You can edit these until the tournament starts</span>
  </div>

  {#if !teams}
    <ol class="flex flex-col gap-2 p-0">
      {#each draft.solo as e, i (e.key)}
        <li class="flex items-center gap-2">
          <span class="w-6 shrink-0 text-right text-small font-semibold text-text-dim tabular-nums">{i + 1}</span>
          <Input
            value={e.players[0]?.name ?? ''}
            oninput={(ev: Event & { currentTarget: HTMLInputElement }) => setPlayer(e, 0, ev.currentTarget.value)}
            aria-label="Name {i + 1}"
            maxlength={SPOT_NAME_MAX}
            readonly={isClaimed(e.players[0])}
            title={isClaimed(e.players[0]) ? 'Claimed spot: unlink to rename' : undefined}
            {disabled}
            class="min-w-0 grow"
          />
          <SpotPill state={spotState(e.players[0])} />
          <Button variant="ghost" size="sm" aria-label="Remove {i + 1}" {disabled} onclick={() => draft.solo.splice(i, 1)}
            ><X size={16} /></Button
          >
        </li>
      {/each}
    </ol>
  {:else}
    <div class="grid gap-3 md:grid-cols-2">
      {#each draft.teams as t, i (t.key)}
        <div class="flex min-w-0 flex-col gap-2 rounded-lg border border-line-2 bg-surface-1 p-3">
          <div class="flex items-center gap-2">
            <Input
              bind:value={t.tag}
              maxlength={4}
              aria-label="Team {i + 1} tag"
              title="Team tag, 2–4 letters"
              {disabled}
              class="w-14 shrink-0 px-2 text-center font-mono uppercase"
              style="color:{t.color}"
            />
            <Input bind:value={t.name} aria-label="Team {i + 1} name" maxlength={TEAM_LIMITS.nameMax + 8} {disabled} class="min-w-0 grow" />
            <Button variant="ghost" size="icon-sm" aria-label="Edit {t.name}" {disabled} onclick={() => (editing = i)}
              ><Pencil size={14} /></Button
            >
            <Button variant="ghost" size="icon-sm" aria-label="Remove {t.name}" {disabled} onclick={() => draft.teams.splice(i, 1)}
              ><X size={16} /></Button
            >
          </div>
          {#each { length: rows(t) } as _, j (j)}
            {@const p = t.players.at(j)}
            <div class="flex items-center gap-2 pl-1 {j >= perTeam ? 'opacity-40' : ''}">
              <span
                aria-hidden="true"
                class="flex size-6 shrink-0 items-center justify-center rounded-full bg-surface-chip text-caption font-bold text-ink-2"
                >{p?.name.trim().charAt(0).toUpperCase() ?? ''}</span
              >
              <Input
                value={p?.name ?? ''}
                oninput={(ev: Event & { currentTarget: HTMLInputElement }) => setPlayer(t, j, ev.currentTarget.value)}
                placeholder="Player {j + 1}"
                aria-label="{t.name} player {j + 1}"
                maxlength={SPOT_NAME_MAX}
                readonly={p ? isClaimed(p) : false}
                title={p && isClaimed(p) ? 'Claimed spot: unlink to rename' : undefined}
                {disabled}
                class="min-w-0 grow"
              />
              <SpotPill state={spotState(p)} />
            </div>
          {/each}
        </div>
      {/each}
      {#if draft.teams.length < max}
        <button
          type="button"
          {disabled}
          onclick={addOne}
          class="flex min-h-24 items-center justify-center gap-2 rounded-lg border border-dashed border-line-dashed text-label font-semibold text-text-muted hover:text-text"
          ><Plus size={16} />Add team</button
        >
      {/if}
    </div>
  {/if}

  {#if dropped.length > 0}
    <div role="alert" class="flex flex-wrap items-center gap-3 rounded-md border border-warn-line bg-warn-soft p-3 text-label">
      <TriangleAlert size={16} class="shrink-0 text-warn" aria-hidden="true" />
      <span class="min-w-0 grow">
        With {perTeam} players per team, {and(dropped.map(d => `${d.player} (${d.team})`))} will be removed. Their claim links stop working.
      </span>
      {#if fullest <= 4}<Button variant="outline" size="sm" onclick={() => onkeep(fullest)}>Keep {fullest} per team</Button>{/if}
    </div>
  {/if}
  {#if blocker && list.length > 0}<span class="text-caption text-text-dim">{blocker}</span>{/if}

  {#if !disabled}
    <ParticipantsAdd {teams} full={list.length >= max} onaddone={teams ? undefined : addOne} onlines={lines} />
  {/if}
  <span class="text-caption text-text-dim">
    Everyone starts as a guest. After creating, each spot gets a claim link: send it to the player, and once they claim it, their matches in
    this tournament count for their account (stats, history, achievements).
  </span>
</div>

{#if editing !== null && draft.teams[editing]}
  {@const i = editing}
  <EditTeamDialog
    team={draft.teams[i]}
    n={i + 1}
    {perTeam}
    onclose={() => (editing = null)}
    onsave={(t: DraftEntry) => {
      draft.teams[i] = t
      editing = null
    }}
    onremove={() => {
      draft.teams.splice(i, 1)
      editing = null
    }}
    onunlink={tournamentId ? unlink : undefined}
  />
{/if}
