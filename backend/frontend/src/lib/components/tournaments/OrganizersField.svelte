<script lang="ts">
  // Tournament-Create's "Organizers · optional": chips for the people picked before the tournament
  // exists (saved with it), the live organizers card once it does.
  import { Plus, X } from '@lucide/svelte'
  import { replace } from 'svelte-spa-router'
  import { currentUser } from '$lib/auth'
  import { hrefs } from '$lib/routes'
  import type { OrganizerPick } from '$lib/tournaments/organizers'
  import AddOrganizerDialog from './AddOrganizerDialog.svelte'
  import OrganizersCard from './OrganizersCard.svelte'

  let {
    tournamentId,
    tournamentName,
    picks = $bindable(),
  }: { tournamentId?: string; tournamentName: string; picks: OrganizerPick[] } = $props()

  let adding = $state(false)

  function pick(p: OrganizerPick): Promise<string | null> {
    picks = [...picks, p]
    return Promise.resolve(null)
  }
</script>

{#if tournamentId}
  <OrganizersCard {tournamentId} {tournamentName} onleft={() => void replace(hrefs.tournaments('mine').slice(1))} />
{:else}
  <div class="flex flex-col gap-2">
    <span class="text-label font-semibold">Organizers <span class="font-normal text-text-dim">· optional</span></span>
    <ul class="flex flex-wrap items-center gap-2 p-0">
      <li class="rounded-pill border border-line bg-surface-2 px-3 py-1.5 text-label">
        {$currentUser?.name ?? 'You'} <span class="text-text-dim">· you</span>
      </li>
      {#each picks as p (p.id)}
        <li class="flex items-center gap-1.5 rounded-pill border border-line bg-surface-2 py-1.5 pl-3 pr-2 text-label">
          {p.name}
          <button
            type="button"
            aria-label="Remove {p.name}"
            class="rounded-full p-0.5 text-text-dim hover:text-text"
            onclick={() => (picks = picks.filter(x => x.id !== p.id))}><X size={14} /></button
          >
        </li>
      {/each}
      <li>
        <button
          type="button"
          class="flex items-center gap-1.5 rounded-pill border border-dashed border-line-3 px-3 py-1.5 text-label font-semibold text-accent"
          onclick={() => (adding = true)}><Plus size={14} />Add organizer</button
        >
      </li>
    </ul>
    <span class="text-caption text-text-dim"
      >Organizers can change everything in this tournament, like you, but can’t add or remove other organizers.</span
    >
  </div>
  {#if adding}
    <AddOrganizerDialog
      {tournamentName}
      existing={[...($currentUser ? [$currentUser.id] : []), ...picks.map(p => p.id)]}
      onadd={pick}
      onclose={() => (adding = false)}
    />
  {/if}
{/if}
