<script lang="ts">
  // "Name or @username": a plain name adds a guest at your board, @ finds an account to invite.
  import { Plus } from '@lucide/svelte'
  import { api } from '$lib/api'
  import { Button } from '$lib/components/ui/button/index.js'
  import MenuItem from './MenuItem.svelte'
  import MenuPanel from './MenuPanel.svelte'
  import { parseAddInput } from '$lib/lobby/input'

  type Account = { id: string; name: string }
  let { onguest, oninvite }: {
    onguest: (name: string) => Promise<boolean>
    oninvite: (userId: string) => Promise<boolean>
  } = $props()

  let text = $state('')
  let hint = $state('')
  let matches = $state<Account[]>([])
  let timer: ReturnType<typeof setTimeout> | undefined
  const parsed = $derived(parseAddInput(text))
  const query = $derived(parsed.kind === 'invite' ? parsed.query : '')

  // @name searches accounts (debounced), as in the new-game player list
  $effect(() => {
    const q = query
    clearTimeout(timer)
    if (!q) { matches = []; return }
    timer = setTimeout(() => {
      api.GET('/api/users', { params: { query: { q } } })
        .then(({ data }) => { if (q === query) matches = data?.users ?? [] })
        .catch(() => { matches = [] })
    }, 200)
  })

  async function invite(u: Account) {
    if (await oninvite(u.id)) { text = ''; matches = [] }
  }

  async function submit() {
    hint = ''
    if (parsed.kind === 'invalid') { hint = parsed.hint; return }
    if (parsed.kind === 'invite') {
      const only = matches.length === 1 ? matches[0] : null
      if (only) await invite(only)
      else hint = matches.length === 0 ? `No account matches @${parsed.query}` : 'Pick who to invite from the list'
      return
    }
    if (await onguest(parsed.name)) text = ''
  }
</script>

<div class="flex flex-col gap-2">
  <form class="relative flex gap-2" onsubmit={(e) => { e.preventDefault(); void submit() }}>
    <label for="add-person" class="sr-only">Add someone: name or @username</label>
    <input id="add-person" bind:value={text} placeholder="Name or @username" autocomplete="off" autocapitalize="off"
      class="flex-grow min-w-0 h-11 box-border px-3 md:px-[14px] bg-bg border border-line-chip rounded-[9px] text-text text-[15px] font-[inherit]" />
    <Button variant="outline" type="submit" class="h-11 bg-surface-key border-0 font-semibold">
      <Plus size={16} />{parsed.kind === 'invite' ? 'Invite' : 'Add guest'}
    </Button>
    {#if matches.length > 0}
      <MenuPanel label="Accounts matching @{query}" align="stretch">
        {#each matches as u (u.id)}<MenuItem label="Invite {u.name}" onclick={() => void invite(u)} />{/each}
      </MenuPanel>
    {/if}
  </form>
  <span class="text-[12px] {hint ? 'text-live-text' : 'text-text-dim'}">
    {hint || 'A @username gets an invite. A plain name adds a guest at your board.'}
  </span>
</div>
