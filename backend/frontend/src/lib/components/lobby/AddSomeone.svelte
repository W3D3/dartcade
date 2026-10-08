<script lang="ts">
  // "Name or @username": a plain name adds a guest at your board; @ invites an account — your
  // friends whose name starts with it first, then whoever has exactly that name. Under it, your
  // friends as one-tap chips (online first) on phones; tablets and desktops have the lobby's
  // Friends tab instead.
  import { Plus } from '@lucide/svelte'
  import { api } from '$lib/api'
  import { Button } from '$lib/components/ui/button/index.js'
  import FriendChips from './FriendChips.svelte'
  import MenuItem from './MenuItem.svelte'
  import PopoverPanel from './PopoverPanel.svelte'
  import { parseAddInput } from '$lib/lobby/input'
  import { friendChips, friendMatches } from '$lib/lobby/friendChips'
  import { me } from '$lib/lobby/sockets'

  type Account = { id: string; name: string }
  let {
    exclude = [],
    onguest,
    oninvite,
  }: {
    /** Accounts not to suggest: already in the lobby or invited. */
    exclude?: string[]
    onguest: (name: string) => Promise<boolean>
    oninvite: (userId: string) => Promise<boolean>
  } = $props()

  let text = $state('')
  let hint = $state('')
  // The server's exact-name match for what's typed
  let matches = $state<Account[]>([])
  // The suggestions show until Escape, a click outside, or a pick
  let open = $state(false)
  let form: HTMLFormElement | undefined = $state()
  let timer: ReturnType<typeof setTimeout> | undefined
  // The latest lookup, so Enter can wait for the one for what's typed now
  let pending: { q: string; result: Promise<Account[]> } | null = null
  const parsed = $derived(parseAddInput(text))
  const query = $derived(parsed.kind === 'invite' ? parsed.query : '')
  const friendList = $derived($me?.friends?.friends ?? [])
  const chips = $derived(friendChips(friendList, exclude))
  const friendHits = $derived(friendMatches(friendList, query, exclude))
  const suggestions = $derived([
    ...friendHits.map(f => ({ id: f.id, name: f.name, friend: true })),
    ...matches.filter(u => !friendHits.some(f => f.id === u.id)).map(u => ({ ...u, friend: false })),
  ])

  function lookup(q: string): Promise<Account[]> {
    clearTimeout(timer)
    const result = api
      .GET('/api/users', { params: { query: { q } } })
      .then(({ data }) => (data?.users ?? []).filter(u => !exclude.includes(u.id)))
      .catch(() => [])
    pending = { q, result }
    void result.then(users => {
      if (q === query) {
        matches = users
        open = true
      }
    })
    return result
  }

  // @name looks the name up (debounced); friends match at once
  $effect(() => {
    const q = query
    clearTimeout(timer)
    pending = null
    matches = []
    if (!q) return
    timer = setTimeout(() => void lookup(q), 200)
  })

  async function invite(u: Account) {
    if (await oninvite(u.id)) {
      text = ''
      matches = []
    }
  }

  async function submit() {
    hint = ''
    if (parsed.kind === 'invalid') {
      hint = parsed.hint
      return
    }
    if (parsed.kind === 'invite') {
      const q = parsed.query
      // Enter within the debounce: look up now rather than use the previous query's match
      const found = await (pending?.q === q ? pending.result : lookup(q))
      if (q !== query) return
      const hits = friendMatches(friendList, q, exclude)
      const all: Account[] = [...hits, ...found.filter(u => !hits.some(f => f.id === u.id))]
      const exact = all.find(u => u.name.toLowerCase() === q.toLowerCase())
      const only = exact ?? (all.length === 1 ? all[0] : null)
      if (only) await invite(only)
      else hint = all.length === 0 ? `No player called ${q}` : 'Pick who to invite from the list'
      return
    }
    if (await onguest(parsed.name)) text = ''
  }

  function outside(e: PointerEvent) {
    if (open && form && e.target instanceof Node && !form.contains(e.target)) open = false
  }
</script>

<svelte:window onpointerdown={outside} />

<div class="flex flex-col gap-2">
  <form
    bind:this={form}
    class="relative flex gap-2"
    onsubmit={e => {
      e.preventDefault()
      void submit()
    }}
  >
    <label for="add-person" class="sr-only">Add someone: name or @username</label>
    <input
      id="add-person"
      bind:value={text}
      placeholder="Name or @username"
      autocomplete="off"
      autocapitalize="off"
      oninput={() => {
        hint = ''
        open = true
      }}
      onkeydown={e => {
        if (e.key === 'Escape') open = false
      }}
      class="flex-grow min-w-0 h-11 box-border px-3 md:px-[14px] bg-bg border border-line-chip rounded-[9px] text-text text-[15px] font-[inherit]"
    />
    <Button variant="outline" size="md" type="submit" class="bg-surface-key border-0 font-semibold">
      <Plus size={16} />{parsed.kind === 'invite' ? 'Invite' : 'Add guest'}
    </Button>
    {#if open && suggestions.length > 0}
      <PopoverPanel label="Players matching @{query}" align="stretch">
        {#each suggestions as s (s.id)}
          <MenuItem label="Invite {s.name}" detail={s.friend ? 'Friend' : undefined} onclick={() => void invite(s)} />
        {/each}
      </PopoverPanel>
    {/if}
  </form>
  <span class="text-[12px] {hint ? 'text-live-text' : 'text-text-dim'}">
    {hint || 'A @name gets an invite. A plain name adds a guest at your board.'}
  </span>
  {#if chips.length > 0}<div class="md:hidden"><FriendChips {chips} onpick={(id: string) => void oninvite(id)} /></div>{/if}
</div>
