<script lang="ts">
  // The organizers of a tournament that exists (Tournament-Onsite-Organizer's Organizers card): the
  // owner, then each co-organizer with when they were added. The owner adds and removes them; an
  // organizer can leave. Stands alone, so the Create page and the organizer page both mount it.
  import { UserPlus } from '@lucide/svelte'
  import Avatar from '$lib/components/Avatar.svelte'
  import ErrorText from '$lib/components/ErrorText.svelte'
  import { Button } from '$lib/components/ui/button/index.js'
  import { currentUser } from '$lib/auth'
  import type { PickerPerson } from '$lib/teams/view'
  import { addOrganizer, loadOrganizers, organizerLine, removeOrganizer, type Organizer } from '$lib/tournaments/organizers'
  import AddOrganizerDialog from './AddOrganizerDialog.svelte'

  let { tournamentId, tournamentName, onleft }: { tournamentId: string; tournamentName: string; onleft?: () => void } = $props()

  let organizers = $state<Organizer[] | null>(null)
  let adding = $state(false)
  let error = $state('')
  const myId = $derived($currentUser?.id)
  const isOwner = $derived(organizers?.some(o => o.role === 'owner' && o.id === myId) ?? false)

  const reload = async () => (organizers = await loadOrganizers(tournamentId))
  $effect(() => {
    // Reload when the tournament changes
    if (tournamentId) void reload()
  })

  async function add(p: PickerPerson): Promise<string | null> {
    const refused = await addOrganizer(tournamentId, p.id)
    if (!refused) await reload()
    return refused
  }

  async function remove(o: Organizer) {
    error = (await removeOrganizer(tournamentId, o.id)) ?? ''
    if (error) return
    if (o.id === myId) return onleft?.()
    await reload()
  }
</script>

<section aria-label="Organizers" class="flex flex-col gap-3">
  <div class="flex items-center justify-between gap-3">
    <h3 class="text-label font-semibold">Organizers</h3>
    {#if isOwner}
      <Button variant="outline" size="sm" onclick={() => (adding = true)}><UserPlus size={15} />Add</Button>
    {/if}
  </div>
  {#if organizers}
    <ul class="flex flex-col p-0">
      {#each organizers as o (o.id)}
        <li class="flex items-center gap-3 py-2">
          <Avatar name={o.name} face={null} size={32} />
          <span class="flex min-w-0 flex-1 flex-col">
            <span class="truncate text-label font-semibold">{o.name}{o.id === myId ? ' (you)' : ''}</span>
            <span class="text-caption text-text-muted">{organizerLine(o, new Date())}</span>
          </span>
          {#if o.role === 'owner'}
            <span class="rounded-pill bg-surface-chip px-2 py-0.5 text-caption font-semibold uppercase text-accent">Owner</span>
          {:else if isOwner}
            <Button variant="outline" size="sm" aria-label="Remove {o.name}" onclick={() => void remove(o)}>Remove</Button>
          {:else if o.id === myId}
            <Button variant="outline" size="sm" onclick={() => void remove(o)}>Leave</Button>
          {/if}
        </li>
      {/each}
    </ul>
    <p class="text-caption text-text-dim">
      Organizers can change everything in this tournament{isOwner ? ', like you' : ''}. Only the owner can add or remove organizers.
    </p>
  {/if}
  {#if error}<ErrorText>{error}</ErrorText>{/if}
</section>

{#if adding}
  <AddOrganizerDialog {tournamentName} existing={organizers?.map(o => o.id) ?? []} onadd={add} onclose={() => (adding = false)} />
{/if}
