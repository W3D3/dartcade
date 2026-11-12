<script lang="ts">
  // The Tournaments page's Teams tab (Tournaments-Teams): invites to answer and the teams you
  // registered that still wait for a player (Waiting on Lena) on top, then your teams
  // on the left and the picked one on the right (stacked on a phone). Reloads when /ws/me says your
  // invites changed. `creating` opens New team (the page's header button sets it).
  import { Plus, UsersRound } from '@lucide/svelte'
  import { currentUser } from '$lib/auth'
  import PageLoading from '$lib/components/PageLoading.svelte'
  import EmptyState from '$lib/components/lobby/EmptyState.svelte'
  import ErrorText from '$lib/components/ErrorText.svelte'
  import { Button } from '$lib/components/ui/button/index.js'
  import { me } from '$lib/lobby/sockets'
  import { loadTeams, type Team } from '$lib/teams/actions'
  import type { TournamentSummary } from '$lib/api'
  import TeamEntryCard from '$lib/components/tournaments/TeamEntryCard.svelte'
  import { loadBrowse } from '$lib/tournaments/browse'
  import type { TeamInvite } from '$lib/api/lobby-ws'
  import { TEAM_LIMITS } from '$shared/teams.js'
  import InvitePlayersDialog from './InvitePlayersDialog.svelte'
  import TeamCard from './TeamCard.svelte'
  import TeamDetail from './TeamDetail.svelte'
  import TeamFormDialog from './TeamFormDialog.svelte'
  import TeamInviteBanner from './TeamInviteBanner.svelte'

  let { creating = $bindable(false) }: { creating?: boolean } = $props()

  let data = $state<{ teams: Team[]; invites: TeamInvite[] } | null>(null)
  let failed = $state(false)
  let selectedId = $state<string | null>(null)
  let editing = $state<Team | null>(null)
  let inviting = $state<Team | null>(null)
  const now = new Date()

  const myId = $derived($currentUser?.id ?? '')
  const self = $derived($currentUser ? { id: $currentUser.id, name: $currentUser.name, avatar: $currentUser.avatar, detail: '' } : null)
  const selected = $derived(data?.teams.find(t => t.id === selectedId) ?? data?.teams[0] ?? null)
  const canMake = $derived((data?.teams.length ?? 0) < TEAM_LIMITS.teamsPerPlayer)
  // Tournaments where a team you registered still waits for a player
  let waiting = $state<TournamentSummary[]>([])
  async function reloadWaiting() {
    waiting = ((await loadBrowse()) ?? []).filter(t => t.team?.status === 'pending' && t.team.captainId === myId)
  }
  $effect(() => {
    if (myId) void reloadWaiting()
  })

  async function reload() {
    const r = await loadTeams()
    failed = r === null
    if (r) data = r
  }
  // On open, and whenever your pending invites change (a new one, or one answered in another tab)
  let seenInvites: string | undefined
  $effect(() => {
    const ids = ($me?.teamInvites ?? []).map(i => i.id).join()
    if (ids === seenInvites) return
    seenInvites = ids
    void reload()
  })

  function saved(id: string) {
    creating = false
    editing = null
    selectedId = id
    void reload()
  }
</script>

{#if data === null}
  {#if failed}<ErrorText>Couldn't load your teams. Try again in a moment.</ErrorText>{:else}<PageLoading />{/if}
{:else}
  <div class="flex flex-col gap-4 md:gap-5">
    {#each data.invites as invite (invite.id)}
      <TeamInviteBanner {invite} {now} onanswered={() => void reload()} />
    {/each}
    {#each waiting as t (t.id)}
      {#if t.team}
        <TeamEntryCard tournamentId={t.id} tournamentName={t.name} entry={t.team} onchanged={() => void reloadWaiting()} />
      {/if}
    {/each}

    {#if data.teams.length === 0}
      <EmptyState title="No teams yet" text="Make a team, invite friends, and register it for team tournaments again and again.">
        {#snippet icon()}<UsersRound size={24} />{/snippet}
        {#snippet actions()}<Button variant="accent" onclick={() => (creating = true)}><Plus size={16} />New team</Button>{/snippet}
      </EmptyState>
    {:else}
      <div class="grid items-start gap-5 md:grid-cols-[minmax(260px,340px)_minmax(0,1fr)]">
        <div class="flex flex-col gap-3">
          {#each data.teams as team (team.id)}
            <TeamCard {team} {myId} selected={team.id === selected?.id} onselect={() => (selectedId = team.id)} />
          {/each}
          {#if canMake}
            <button
              type="button"
              onclick={() => (creating = true)}
              class="flex h-[86px] items-center justify-center gap-2.5 rounded-popover border-[1.5px] border-dashed border-line-chip text-body font-semibold text-ink-2 hover:text-text"
            >
              <Plus size={18} />New team
            </button>
          {/if}
        </div>
        {#if selected}
          <TeamDetail
            team={selected}
            {myId}
            {now}
            onchanged={() => void reload()}
            onedit={() => (editing = selected)}
            oninvite={() => (inviting = selected)}
          />
        {/if}
      </div>
    {/if}
  </div>
{/if}

{#if self && (creating || editing)}
  <TeamFormDialog team={editing} me={self} onclose={() => ((creating = false), (editing = null))} onsaved={saved} />
{/if}
{#if inviting}
  <InvitePlayersDialog team={inviting} onclose={() => (inviting = null)} oninvited={() => void reload()} />
{/if}
