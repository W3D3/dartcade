<script lang="ts">
  // Edit an in-person team (Tournament-Create's Edit team): name, tag, colour and its players, each
  // a guest with a claim link or claimed (read-only, Unlink). Saved into the list by `onsave`.
  import { Link2 } from '@lucide/svelte'
  import TeamColorPicker from '$lib/components/teams/TeamColorPicker.svelte'
  import TeamEmblem from '$lib/components/teams/TeamEmblem.svelte'
  import { Button } from '$lib/components/ui/button/index.js'
  import { Input } from '$lib/components/ui/input/index.js'
  import { Modal } from '$lib/components/ui/modal/index.js'
  import { createCopy } from '$lib/clipboard.svelte'
  import { claimUrl, isClaimed, spot, spotState, type DraftEntry, type DraftSpot } from '$lib/tournaments/participants'
  import { PLAYERS_PER_TEAM } from '$lib/tournaments/create'
  import { SPOT_NAME_MAX } from '$shared/tournaments/participants'
  import { TEAM_LIMITS } from '$shared/teams'
  import SpotPill from './SpotPill.svelte'

  let {
    team,
    n,
    perTeam,
    onsave,
    onremove,
    onclose,
    onunlink,
  }: {
    team: DraftEntry
    /** Its place on the list, for "Team 3". */
    n: number
    perTeam: number
    onsave: (team: DraftEntry) => void
    onremove: () => void
    onclose: () => void
    /** Unlinks a stored, claimed spot (left out while the tournament isn't saved yet). */
    onunlink?: (s: DraftSpot) => Promise<DraftSpot | null>
  } = $props()

  // The dialog edits a copy, so Cancel leaves the list as it was
  // svelte-ignore state_referenced_locally
  const draft = $state<DraftEntry>({ ...team, players: team.players.map(p => ({ ...p })) })
  // svelte-ignore state_referenced_locally
  for (let i = draft.players.length; i < perTeam; i++) draft.players.push(spot())

  const copy = createCopy()
  let copied = $state('')
  const claimed = $derived(draft.players.find(isClaimed))

  async function unlink(i: number) {
    const s = await onunlink?.(draft.players[i])
    if (s) draft.players[i] = s
  }
</script>

<Modal title="Edit team" subtitle="Team {n}" {onclose} widthClass="md:max-w-[560px]">
  <div class="flex items-center gap-3">
    <TeamEmblem tag={draft.tag.toUpperCase() || '?'} color={draft.color} size={44} />
    <span class="type-card-title min-w-0 truncate">{draft.name || `Team ${n}`}</span>
  </div>
  <div class="grid grid-cols-[1fr_110px] gap-3">
    <label class="flex flex-col gap-1.5">
      <span class="field-label">Team name</span>
      <Input bind:value={draft.name} maxlength={TEAM_LIMITS.nameMax + 8} />
    </label>
    <label class="flex flex-col gap-1.5">
      <span class="field-label">Tag</span>
      <Input bind:value={draft.tag} maxlength={4} class="font-mono uppercase" />
      <span class="text-caption text-text-dim">2–4 letters</span>
    </label>
  </div>
  <TeamColorPicker bind:value={draft.color} name="edit-team-colour" />

  <div class="flex flex-col gap-2">
    <span class="field-label"
      >Players <span class="font-normal text-text-muted"
        >· {#each PLAYERS_PER_TEAM as c, i (c.value)}{i > 0 ? ' ' : ''}<span class={c.value === perTeam ? 'font-bold text-text' : ''}
            >{c.value}</span
          >{/each} per team</span
      ></span
    >
    {#each draft.players as p, i (p.key)}
      <div class="flex items-center gap-2 {i >= perTeam ? 'opacity-50' : ''}">
        <Input
          bind:value={p.name}
          placeholder="Player {i + 1}"
          aria-label="Player {i + 1}"
          maxlength={SPOT_NAME_MAX}
          readonly={isClaimed(p)}
          title={isClaimed(p) ? 'Claimed spot: unlink to rename' : undefined}
          class="min-w-0 grow"
        />
        <SpotPill state={spotState(p)} />
        {#if isClaimed(p) && onunlink}
          <Button variant="ghost" size="sm" onclick={() => unlink(i)}>Unlink</Button>
        {:else if p.claimCode && !isClaimed(p)}
          <Button
            variant="ghost"
            size="sm"
            onclick={() => {
              copied = p.key
              void copy.copy(claimUrl(p.claimCode ?? ''))
            }}><Link2 size={14} />{copied === p.key && copy.state === 'copied' ? 'Copied' : 'Claim link'}</Button
          >
        {/if}
      </div>
    {/each}
    <span class="text-caption text-text-dim">
      Claim links are per player.{#if claimed}
        {claimed.name} already claimed their spot, so their name can’t be changed here; unlink them first.{/if}
    </span>
  </div>

  {#snippet footer()}
    <Button variant="ghost" class="mr-auto text-danger-text" onclick={onremove}>Remove team</Button>
    <Button variant="ghost" onclick={onclose}>Cancel</Button>
    <Button variant="accent" onclick={() => onsave({ ...draft, players: draft.players.filter(p => p.name.trim()) })}>Save team</Button>
  {/snippet}
</Modal>
