<script lang="ts">
  // "Add a friend": a name (with or without @), part of one or an exact email; matches show under it
  // with an Add button each, or Send request asks the exact name typed.
  // A card on tablets and desktops; on phones just the field and Add friend.
  import { Check } from '@lucide/svelte'
  import { Button } from '$lib/components/ui/button/index.js'
  import { Input } from '$lib/components/ui/input/index.js'
  import Avatar from '$lib/components/Avatar.svelte'
  import type { FriendSearchHit } from '$lib/api'
  import { searchPeople, sendRequest } from '$lib/friends/actions'
  import { mutualMeta, searchState, SEARCH_MIN } from '$lib/friends/view'

  let text = $state('')
  let result = $state<{ ok: boolean; text: string } | null>(null)
  let busy = $state(false)

  let matches = $state<FriendSearchHit[]>([])
  let timer: ReturnType<typeof setTimeout> | undefined
  let latest = 0

  function search() {
    clearTimeout(timer)
    const q = text.trim()
    const mine = ++latest
    if (q.replace(/^@/, '').length < SEARCH_MIN) {
      matches = []
      return
    }
    timer = setTimeout(() => {
      void searchPeople(q).then(found => {
        if (mine === latest) matches = found
      })
    }, 250)
  }

  async function send(raw = text) {
    if (busy) return
    busy = true
    try {
      result = await sendRequest(raw)
      if (result.ok) {
        text = ''
        search() // an empty text also drops a pending search and its late answer
      }
    } finally {
      busy = false
    }
  }
</script>

<section aria-label="Add a friend" class="flex flex-col gap-[10px] md:box-border md:p-[18px] md:card">
  <h2 class="hidden md:block m-0 text-[15px] font-semibold">Add a friend</h2>
  <form
    class="flex gap-2"
    onsubmit={e => {
      e.preventDefault()
      void send()
    }}
  >
    <label for="add-friend" class="sr-only">Name or email</label>
    <Input
      id="add-friend"
      bind:value={text}
      placeholder="Name or email"
      autocomplete="off"
      autocapitalize="off"
      spellcheck="false"
      oninput={() => {
        result = null
        search()
      }}
      class="flex-grow min-w-0 h-[46px] md:h-11 px-3 rounded-[9px] border-line-chip bg-surface-panel md:bg-bg font-mono text-[14px]"
    />
    <Button type="submit" variant="accent" disabled={busy} class="h-[46px] md:h-11 px-[14px] rounded-[9px] text-[14px]">
      <span class="md:hidden">Add friend</span><span class="hidden md:inline">Send request</span>
    </Button>
  </form>
  {#if matches.length > 0}
    <ul aria-label="Matches" class="m-0 p-0 list-none flex flex-col gap-2">
      {#each matches as m (m.id)}
        {@const state = searchState(m.request)}
        {@const note = [state.action ? state.text : '', mutualMeta(m.mutualFriends)].filter(Boolean).join(' · ')}
        <li class="flex items-center gap-[10px] min-w-0">
          <Avatar name={m.name} face={{ avatar: m.avatar, userId: m.id }} size={36} />
          <span class="flex flex-col min-w-0 flex-grow">
            <span class="text-[14px] font-semibold truncate">{m.name}</span>
            {#if note}<span class="text-[12px] text-text-muted">{note}</span>{/if}
          </span>
          {#if state.action}
            <Button
              type="button"
              variant="accent"
              disabled={busy}
              onclick={() => send(m.name)}
              class="shrink-0 h-9 px-3 rounded-[9px] text-[13px]">{state.action}</Button
            >
          {:else}
            <span class="shrink-0 text-[13px] text-text-muted">{state.text}</span>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
  {#if result}
    <span role="status" class="flex items-center gap-[6px] text-[13px] {result.ok ? 'text-accent' : 'text-live-text'}">
      {#if result.ok}<Check size={16} strokeWidth={3} />{/if}{result.text}
    </span>
  {/if}
  <span class="hidden md:inline text-[12px] leading-[1.45] text-text-dim"
    >They'll see it in Friends and on their badge. Once they accept, you see each other's status.</span
  >
</section>
