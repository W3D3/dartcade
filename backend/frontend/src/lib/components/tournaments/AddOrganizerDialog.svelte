<script lang="ts">
  // "Add an organizer" (Tournament-Onsite-Organizer): search your friends or an exact @username,
  // pick one, read what they will be able to do, add them. People who already are one show as such.
  // `onadd` does the adding and answers with the reason when it is refused (null when done).
  import { Check, X } from '@lucide/svelte'
  import Avatar from '$lib/components/Avatar.svelte'
  import ErrorText from '$lib/components/ErrorText.svelte'
  import { Button } from '$lib/components/ui/button/index.js'
  import SearchInput from '$lib/components/ui/input/search-input.svelte'
  import { Modal } from '$lib/components/ui/modal/index.js'
  import { me } from '$lib/lobby/sockets'
  import { createUserLookup } from '$lib/teams/userLookup.svelte'
  import { pickerPeople, type PickerPerson } from '$lib/teams/view'
  import { ORGANIZER_ABILITIES } from '$lib/tournaments/organizers'

  let {
    tournamentName,
    existing,
    onadd,
    onclose,
  }: { tournamentName: string; existing: string[]; onadd: (p: PickerPerson) => Promise<string | null>; onclose: () => void } = $props()

  let text = $state('')
  let picked = $state<PickerPerson | null>(null)
  let busy = $state(false)
  let error = $state('')
  const query = $derived(text.trim().replace(/^@/, ''))
  const lookup = createUserLookup(() => query)
  const people = $derived(pickerPeople($me?.friends?.friends ?? [], lookup.found, query, []))

  async function add() {
    if (!picked || busy) return
    busy = true
    error = (await onadd(picked)) ?? ''
    busy = false
    if (!error) onclose()
  }
</script>

<Modal title="Add an organizer" subtitle={tournamentName} {onclose} widthClass="md:max-w-[520px]">
  <div class="flex flex-col gap-2">
    <SearchInput bind:value={text} label="Search friends or @username" />
    {#if people.length > 0}
      <ul class="flex flex-col p-0">
        {#each people as p (p.id)}
          {@const already = existing.includes(p.id)}
          <li class="flex items-center gap-3 rounded-md px-2.5 py-2 {picked?.id === p.id ? 'bg-surface-2' : ''}">
            <Avatar name={p.name} face={{ avatar: p.avatar, userId: p.id }} size={32} />
            <span class="flex min-w-0 flex-1 flex-col">
              <span class="truncate text-label font-semibold">{p.name}</span>
              <span class="text-caption text-text-muted">{p.detail}</span>
            </span>
            {#if already}
              <span class="text-caption font-semibold uppercase text-text-dim">Already organizer</span>
            {:else}
              <Button
                variant={picked?.id === p.id ? 'primary' : 'outline'}
                size="sm"
                aria-pressed={picked?.id === p.id}
                aria-label="Select {p.name}"
                onclick={() => (picked = p)}>{picked?.id === p.id ? 'Selected' : 'Select'}</Button
              >
            {/if}
          </li>
        {/each}
      </ul>
    {:else if query !== ''}
      <p class="text-small text-text-dim">No friend called {query}. Type their exact name to find anyone else.</p>
    {/if}
  </div>

  {#if picked}
    <div class="flex flex-col gap-2 rounded-md border border-line bg-surface-2 p-3.5">
      <span class="text-label font-semibold">{picked.name} will be able to</span>
      <ul class="flex flex-col gap-1.5 p-0">
        {#each ORGANIZER_ABILITIES as a (a)}
          <li class="flex items-start gap-2 text-label text-text-muted"><Check size={15} class="mt-0.5 shrink-0 text-accent" />{a}</li>
        {/each}
        <li class="flex items-start gap-2 text-label text-text-dim">
          <X size={15} class="mt-0.5 shrink-0" />Add or remove organizers. Only you can.
        </li>
      </ul>
    </div>
    <p class="text-small text-text-muted">
      {picked.name} gets a notification and can leave the role at any time. You can remove {picked.name} as organizer whenever you like.
    </p>
  {/if}
  {#if error}<ErrorText>{error}</ErrorText>{/if}

  <div class="flex flex-col-reverse gap-2 md:flex-row md:justify-end">
    <Button variant="outline" onclick={onclose}>Cancel</Button>
    <Button disabled={!picked || busy} onclick={() => void add()}>{picked ? `Add ${picked.name} as organizer` : 'Add organizer'}</Button>
  </div>
</Modal>
