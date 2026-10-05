<script lang="ts">
  // "Add a friend": a name (with or without @) and Send request; the result shows under it.
  // A card on tablets and desktops; on phones just the field and Add friend.
  import { Check } from '@lucide/svelte'
  import { Button } from '$lib/components/ui/button/index.js'
  import { Input } from '$lib/components/ui/input/index.js'
  import { sendRequest } from '$lib/friends/actions'

  let text = $state('')
  let result = $state<{ ok: boolean; text: string } | null>(null)
  let busy = $state(false)

  async function send() {
    if (busy) return
    busy = true
    try {
      result = await sendRequest(text)
      if (result.ok) text = ''
    } finally {
      busy = false
    }
  }
</script>

<section
  aria-label="Add a friend"
  class="flex flex-col gap-[10px] md:box-border md:p-[18px] md:rounded-[14px] md:bg-surface-panel md:border md:border-line-2"
>
  <h2 class="hidden md:block m-0 text-[15px] font-semibold">Add a friend</h2>
  <form
    class="flex gap-2"
    onsubmit={e => {
      e.preventDefault()
      void send()
    }}
  >
    <label for="add-friend" class="sr-only">Username</label>
    <Input
      id="add-friend"
      bind:value={text}
      placeholder="@username"
      autocomplete="off"
      autocapitalize="off"
      spellcheck="false"
      oninput={() => {
        result = null
      }}
      class="flex-grow min-w-0 h-[46px] md:h-11 px-3 rounded-[9px] border-line-chip bg-surface-panel md:bg-bg font-mono text-[14px]"
    />
    <Button type="submit" variant="accent" disabled={busy} class="h-[46px] md:h-11 px-[14px] rounded-[9px] text-[14px]">
      <span class="md:hidden">Add friend</span><span class="hidden md:inline">Send request</span>
    </Button>
  </form>
  {#if result}
    <span role="status" class="flex items-center gap-[6px] text-[13px] {result.ok ? 'text-accent' : 'text-live-text'}">
      {#if result.ok}<Check size={16} strokeWidth={3} />{/if}{result.text}
    </span>
  {/if}
  <span class="hidden md:inline text-[12px] leading-[1.45] text-text-dim"
    >They'll see it in Friends and on their badge. Once they accept, you see each other's status.</span
  >
</section>
