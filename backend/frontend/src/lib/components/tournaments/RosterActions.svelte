<script lang="ts">
  // The captain's buttons for a team still to complete: Change player (an empty place first, else
  // the first still waiting) and Remind whoever has not answered, with what came of it.
  import { Bell, UserRoundPen } from '@lucide/svelte'
  import ErrorText from '$lib/components/ErrorText.svelte'
  import { Button } from '$lib/components/ui/button'
  import { joinNames } from '$lib/fmt'
  import { remindPlayers, waitingNames, type TeamEntry } from '$lib/tournaments/roster'
  import ChangePlayerDialog from './ChangePlayerDialog.svelte'

  let { tournamentId, entry, onchanged }: { tournamentId: string; entry: TeamEntry; onchanged: () => void } = $props()

  const waiting = $derived(waitingNames(entry))
  const changeable = $derived(entry.slots.find(s => s.user === null) ?? entry.slots.find(s => !s.confirmed))
  let changing = $state<number | null>(null)
  let busy = $state(false)
  let note = $state('')
  let error = $state('')

  async function remind() {
    busy = true
    error = (await remindPlayers(tournamentId)) ?? ''
    busy = false
    note = error ? '' : 'Reminder sent'
  }
</script>

<span class="flex flex-wrap items-center gap-2.5">
  {#if changeable}
    <Button variant="outline" size="sm" disabled={busy} onclick={() => (changing = changeable.position)}
      ><UserRoundPen size={15} />Change player</Button
    >
  {/if}
  {#if waiting.length > 0}
    <Button variant="accent" size="sm" disabled={busy} onclick={() => void remind()}><Bell size={15} />Remind {joinNames(waiting)}</Button>
  {/if}
  {#if note}<span class="text-small text-accent" role="status">{note}</span>{/if}
  {#if error}<ErrorText>{error}</ErrorText>{/if}
</span>

{#if changing !== null}
  <ChangePlayerDialog
    {tournamentId}
    {entry}
    position={changing}
    onclose={() => (changing = null)}
    onchanged={() => {
      changing = null
      note = 'Request sent'
      onchanged()
    }}
  />
{/if}
