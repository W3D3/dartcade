<script lang="ts">
  // "Search friends" (Team-Create): your friends, online first, filtered as you type, and the
  // account with exactly the name you typed (with or without the @). Invite hands the person up.
  import { UserPlus } from '@lucide/svelte'
  import Avatar from '$lib/components/Avatar.svelte'
  import { Button } from '$lib/components/ui/button/index.js'
  import SearchInput from '$lib/components/ui/input/search-input.svelte'
  import { me } from '$lib/lobby/sockets'
  import { createUserLookup } from '$lib/teams/userLookup.svelte'
  import { pickerPeople, type PickerPerson } from '$lib/teams/view'

  let { exclude, onpick }: { exclude: string[]; onpick: (p: PickerPerson) => void } = $props()

  let text = $state('')
  const query = $derived(text.trim().replace(/^@/, ''))
  const lookup = createUserLookup(() => query)
  const people = $derived(pickerPeople($me?.friends?.friends ?? [], lookup.found, query, exclude))
</script>

<div class="flex flex-col gap-2">
  <SearchInput bind:value={text} label="Search friends or @username" />
  {#if people.length > 0}
    <ul class="flex flex-col p-0">
      {#each people as p (p.id)}
        <li class="flex items-center gap-3 rounded-md px-2.5 py-2">
          <Avatar name={p.name} face={{ avatar: p.avatar, userId: p.id }} size={32} />
          <span class="flex min-w-0 flex-1 flex-col">
            <span class="truncate text-label font-semibold">{p.name}</span>
            <span class="text-caption text-text-muted">{p.detail}</span>
          </span>
          <Button variant="outline" size="sm" aria-label="Invite {p.name}" onclick={() => onpick(p)}><UserPlus size={15} />Invite</Button>
        </li>
      {/each}
    </ul>
  {:else if query !== ''}
    <p class="text-small text-text-dim">No friend called {query}. Type their exact name to find anyone else.</p>
  {/if}
</div>
