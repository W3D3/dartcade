<script lang="ts">
  // A player in the new-game list: you, a guest by name, or (typing @…) another account,
  // who then plays this seat from their own device.
  import { api } from '$lib/api'

  type Account = { id: string; name: string }
  let { index, name = $bindable(''), account = $bindable(null), isYou = false, onRemove }: {
    index: number
    name: string
    /** Another account playing this seat, picked with @. */
    account?: Account | null
    isYou?: boolean
    onRemove?: () => void
  } = $props()

  const initial = $derived((account?.name || name || (isYou ? 'Y' : 'G'))[0].toUpperCase())

  // @name searches accounts (debounced); picking one links the seat
  let matches = $state<Account[]>([])
  let timer: ReturnType<typeof setTimeout> | undefined
  const query = $derived(!account && name.startsWith('@') ? name.slice(1).trim() : '')
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

  function pick(u: Account) {
    account = u
    name = u.name
    matches = []
  }
  function unlink() {
    account = null
    name = ''
  }
</script>

<div class="relative">
  <div class="flex items-center gap-3 h-12 px-3 bg-[#1b1d18] rounded-[10px]">
    <span class="font-mono text-[12px] text-[#7d7f74] shrink-0 w-3 text-center">{index}</span>
    <span class="w-7 h-7 rounded-full flex items-center justify-center font-bold text-[13px] shrink-0
                 {isYou || account ? 'bg-accent text-accent-fg' : 'bg-[#3a3e36] text-text'}">
      {initial}
    </span>
    {#if isYou}
      <span class="text-[15px] font-semibold flex-grow text-text">{name || 'You'}</span>
      <span class="text-[12px] text-text-dim shrink-0">You</span>
    {:else}
      {#if account}
        <span class="text-[15px] font-semibold flex-grow text-text truncate">{account.name}</span>
        <span class="text-[12px] text-accent shrink-0" title="Plays from their own device">Account</span>
      {:else}
        <input bind:value={name} placeholder="Guest {index} or @name" aria-label="Player {index}: a guest's name, or @ to add an account"
          autocomplete="off" autocapitalize="off"
          class="text-[15px] font-semibold flex-grow bg-transparent border-0 outline-none
                 text-text placeholder:text-text-dim min-w-0" />
        <span class="text-[12px] text-text-dim shrink-0">Guest</span>
      {/if}
      {#if onRemove}
        <button type="button" onclick={account ? unlink : onRemove} aria-label={account ? `Remove ${account.name}` : 'Remove player'}
          class="w-7 h-7 flex items-center justify-center text-text-dim hover:text-live-text
                 transition-colors border-0 bg-transparent cursor-pointer shrink-0 text-[16px]">
          ✕
        </button>
      {/if}
    {/if}
  </div>

  {#if matches.length}
    <ul role="listbox" aria-label="Accounts" class="absolute left-0 right-0 top-full mt-1 z-30 m-0 p-1 list-none rounded-[10px]
               bg-surface-2 border border-line-3 [box-shadow:0_12px_32px_rgba(0,0,0,0.5)]">
      {#each matches as u (u.id)}
        <li>
          <button type="button" role="option" aria-selected="false" onclick={() => pick(u)}
            class="w-full h-11 px-3 flex items-center gap-3 rounded-[8px] border-0 bg-transparent text-left text-[15px] text-text cursor-pointer hover:bg-surface-active font-[inherit]">
            <span class="w-7 h-7 rounded-full flex items-center justify-center font-bold text-[13px] bg-[#3a3e36]">{u.name.charAt(0).toUpperCase()}</span>
            <span class="truncate">{u.name}</span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>
