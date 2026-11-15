<script lang="ts">
  // "Claim guests" on a finished game you hosted: every guest seat with its place, and a friend to
  // ask to take it over. The friend has to accept before the game counts as theirs; until then
  // you can change who you asked or take the invite back.
  import type { Friend } from '$lib/api/lobby-ws'
  import ErrorText from '$lib/components/ErrorText.svelte'
  import { Button } from '$lib/components/ui/button/index.js'
  import { Modal } from '$lib/components/ui/modal/index.js'
  import { cancelInvite, inviteFriend, type GuestClaims } from '$lib/guestClaims/actions'
  import { askedFriends, seatLine } from '$lib/guestClaims/view'
  import FriendCombobox from './FriendCombobox.svelte'

  let {
    gameId,
    claims,
    onclose,
    onchange,
  }: { gameId: string; claims: GuestClaims; onclose: () => void; onchange: (c: GuestClaims) => void } = $props()

  let error = $state('')
  // Seats whose friend is being changed
  let changing = $state<number[]>([])
  let busy = $state(false)

  async function pick(seat: number, userId: string) {
    busy = true
    const res = await inviteFriend(gameId, seat, userId)
    busy = false
    if ('error' in res) {
      error = res.error
      return
    }
    error = ''
    changing = changing.filter(s => s !== seat)
    onchange(res.claims)
  }

  async function cancel(seat: number) {
    busy = true
    const failed = await cancelInvite(gameId, seat)
    busy = false
    if (failed) {
      error = failed
      return
    }
    error = ''
    onchange({ ...claims, seats: claims.seats.map(s => (s.seat === seat ? { ...s, invite: null } : s)) })
  }
</script>

<Modal
  title="Claim guests"
  subtitle="Ask a friend to take over a guest's seat. The game counts for them once they accept."
  {onclose}
  widthClass="md:max-w-[560px]"
>
  <ul class="flex flex-col gap-3">
    {#each claims.seats as s (s.seat)}
      <li class="flex flex-col gap-2 rounded-md border border-line bg-bg p-3" aria-label="Guest {s.name}">
        <span class="text-label font-semibold">{seatLine(s)}</span>
        {#if s.invite && !changing.includes(s.seat)}
          <span class="flex flex-wrap items-center gap-2 text-small text-text-muted">
            <span class="grow">Waiting for <b class="text-text">{s.invite.user.name}</b> to accept</span>
            <Button variant="outline" size="sm" disabled={busy} onclick={() => (changing = [...changing, s.seat])}>Change</Button>
            <Button variant="outline" size="sm" disabled={busy} onclick={() => void cancel(s.seat)}>Cancel invite</Button>
          </span>
        {:else}
          <FriendCombobox
            label="Friend for {s.name}"
            exclude={askedFriends(claims.seats, s.seat)}
            disabled={busy}
            onpick={(f: Friend) => void pick(s.seat, f.id)}
          />
        {/if}
      </li>
    {/each}
  </ul>
  {#if error}<ErrorText>{error}</ErrorText>{/if}
  {#snippet footer()}
    <Button variant="outline" size="md" onclick={onclose}>Done</Button>
  {/snippet}
</Modal>
