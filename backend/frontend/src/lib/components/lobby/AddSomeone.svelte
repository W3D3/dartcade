<script lang="ts">
  // "Name or @username": a plain name adds a guest at your board, @ finds an account to invite.
  import { Plus } from '@lucide/svelte'
  import { api } from '$lib/api'
  import { Button } from '$lib/components/ui/button/index.js'
  import MenuItem from './MenuItem.svelte'
  import PopoverPanel from './PopoverPanel.svelte'
  import { parseAddInput } from '$lib/lobby/input'

  type Account = { id: string; name: string }
  let { exclude = [], onguest, oninvite }: {
    /** Accounts not to suggest: already in the lobby or invited. */
    exclude?: string[]
    onguest: (name: string) => Promise<boolean>
    oninvite: (userId: string) => Promise<boolean>
  } = $props()

  let text = $state('')
  let hint = $state('')
  let matches = $state<Account[]>([])
  // The suggestions show until Escape, a click outside, or a pick
  let open = $state(false)
  let form: HTMLFormElement | undefined = $state()
  let timer: ReturnType<typeof setTimeout> | undefined
  // The latest search, so Enter can wait for the one for what's typed now
  let pending: { q: string; result: Promise<Account[]> } | null = null
  const parsed = $derived(parseAddInput(text))
  const query = $derived(parsed.kind === 'invite' ? parsed.query : '')

  function search(q: string): Promise<Account[]> {
    clearTimeout(timer)
    const result = api.GET('/api/users', { params: { query: { q } } })
      .then(({ data }) => (data?.users ?? []).filter(u => !exclude.includes(u.id)))
      .catch(() => [])
    pending = { q, result }
    void result.then(users => { if (q === query) { matches = users; open = true } })
    return result
  }

  // @name searches accounts (debounced), as in the new-game player list
  $effect(() => {
    const q = query
    clearTimeout(timer)
    pending = null
    if (!q) { matches = []; return }
    timer = setTimeout(() => void search(q), 200)
  })

  async function invite(u: Account) {
    if (await oninvite(u.id)) { text = ''; matches = [] }
  }

  async function submit() {
    hint = ''
    if (parsed.kind === 'invalid') { hint = parsed.hint; return }
    if (parsed.kind === 'invite') {
      const q = parsed.query
      // Enter within the debounce: search now rather than use the previous query's matches
      const found = await (pending?.q === q ? pending.result : search(q))
      if (q !== query) return
      const only = found.length === 1 ? found[0] : null
      if (only) await invite(only)
      else hint = found.length === 0 ? `No account to invite matches @${q}` : 'Pick who to invite from the list'
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
  <form bind:this={form} class="relative flex gap-2" onsubmit={(e) => { e.preventDefault(); void submit() }}>
    <label for="add-person" class="sr-only">Add someone: name or @username</label>
    <input id="add-person" bind:value={text} placeholder="Name or @username" autocomplete="off" autocapitalize="off"
      oninput={() => { hint = ''; open = true }}
      onkeydown={(e) => { if (e.key === 'Escape') open = false }}
      class="flex-grow min-w-0 h-11 box-border px-3 md:px-[14px] bg-bg border border-line-chip rounded-[9px] text-text text-[15px] font-[inherit]" />
    <Button variant="outline" size="md" type="submit" class="bg-surface-key border-0 font-semibold">
      <Plus size={16} />{parsed.kind === 'invite' ? 'Invite' : 'Add guest'}
    </Button>
    {#if open && matches.length > 0}
      <PopoverPanel label="Accounts matching @{query}" align="stretch">
        {#each matches as u (u.id)}<MenuItem label="Invite {u.name}" onclick={() => void invite(u)} />{/each}
      </PopoverPanel>
    {/if}
  </form>
  <span class="text-[12px] {hint ? 'text-live-text' : 'text-text-dim'}">
    {hint || 'A @username gets an invite. A plain name adds a guest at your board.'}
  </span>
</div>
