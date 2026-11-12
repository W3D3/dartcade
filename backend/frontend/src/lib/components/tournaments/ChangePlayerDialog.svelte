<script lang="ts">
  // Change player: the captain puts another team member in a place that is empty or still waits
  // for its player. The others keep their places; the list says who would break the limit.
  import { Check } from '@lucide/svelte'
  import Avatar from '$lib/components/Avatar.svelte'
  import ErrorText from '$lib/components/ErrorText.svelte'
  import PageLoading from '$lib/components/PageLoading.svelte'
  import { Button } from '$lib/components/ui/button'
  import { Modal } from '$lib/components/ui/modal'
  import type { Tournament } from '$lib/api'
  import { currentUser } from '$lib/auth'
  import { loadTournament } from '$lib/tournaments/browse'
  import { changePlayer, loadTeamOptions, pickRows, sendLabel, type TeamEntry, type TeamOption } from '$lib/tournaments/roster'

  let {
    tournamentId,
    entry,
    position,
    onclose,
    onchanged,
  }: { tournamentId: string; entry: TeamEntry; position: number; onclose: () => void; onchanged: () => void } = $props()

  const myId = $derived($currentUser?.id ?? '')
  let t = $state<Tournament | null>(null)
  let team = $state<TeamOption | null>(null)
  let chosen = $state<string | null>(null)
  let busy = $state(false)
  let error = $state('')

  const leaving = $derived(entry.slots[position]?.user ?? null)
  // Everyone else keeps their place
  const others = $derived(entry.slots.flatMap(s => (s.position === position || s.user === null ? [] : [s.user.id])))
  const rows = $derived(
    t && team
      ? pickRows({ ...t, teamSize: others.length + 1 }, team, others, myId).filter(
          r => !others.includes(r.member.user.id) && r.member.user.id !== leaving?.id,
        )
      : [],
  )
  const name = $derived(rows.find(r => r.member.user.id === chosen)?.member.user.name)

  async function send() {
    if (!chosen) return
    busy = true
    const res = await changePlayer(tournamentId, position, chosen)
    busy = false
    if ('error' in res) error = res.error
    else onchanged()
  }

  $effect(() => {
    void Promise.all([loadTournament(tournamentId), loadTeamOptions(tournamentId)]).then(([res, options]) => {
      if ('error' in res) error = res.error
      else t = res.tournament
      team = options?.find(o => o.id === entry.team?.id) ?? null
      if (options !== null && team === null) error = 'This team is gone.'
    })
  })
</script>

<Modal
  title="Change player"
  subtitle={leaving ? `Instead of ${leaving.name}` : 'Pick who takes the open place'}
  {onclose}
  widthClass="md:max-w-[560px]"
>
  {#if t && team}
    {#if rows.length === 0}
      <p class="text-body text-text-muted">Nobody else in {team.name} can play. Invite someone to the team first.</p>
    {/if}
    <ul class="flex flex-col gap-2" role="radiogroup" aria-label="Who plays instead?">
      {#each rows as row (row.member.user.id)}
        {@const on = row.member.user.id === chosen}
        <li>
          <button
            type="button"
            role="radio"
            aria-checked={on}
            disabled={row.disabled}
            onclick={() => (chosen = row.member.user.id)}
            class="flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left disabled:cursor-not-allowed disabled:opacity-60
                   {on ? 'border-accent-line bg-card-active' : 'border-surface-inset'}"
          >
            <span
              class="flex size-[22px] flex-none items-center justify-center rounded-full {on
                ? 'bg-accent text-accent-fg'
                : 'border-2 border-line-chip'}"
            >
              {#if on}<Check size={14} strokeWidth={3} />{/if}
            </span>
            <Avatar name={row.member.user.name} face={{ avatar: row.member.user.avatar, userId: row.member.user.id }} size={34} />
            <span class="flex min-w-0 flex-1 flex-col">
              <span class="text-body font-semibold">{row.member.user.name}</span>
              <span class="text-small text-text-muted">{row.detail}</span>
            </span>
          </button>
        </li>
      {/each}
    </ul>
  {:else if !error}
    <PageLoading />
  {/if}
  {#if error}<ErrorText>{error}</ErrorText>{/if}

  {#snippet footer()}
    <div class="flex w-full justify-end gap-2.5">
      <Button variant="ghost" onclick={onclose}>Cancel</Button>
      <Button variant="accent" disabled={busy || !chosen} onclick={() => void send()}>{sendLabel(name ? [name] : [])}</Button>
    </div>
  {/snippet}
</Modal>
