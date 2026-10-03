<script lang="ts">
  // Under the player list while you're in no lobby: start one, or join with a code.
  import { push } from 'svelte-spa-router'
  import { api } from '$lib/api'
  import { Button } from '$lib/components/ui/button/index.js'

  async function create() {
    await api.POST('/api/lobbies')
    void push('/lobby')
  }
</script>

<div class="flex flex-wrap items-center justify-between gap-3 p-3 rounded-[10px] border border-dashed border-line-dashed">
  <span class="text-[13px] text-text-muted">Friends on their own boards or phones?</span>
  <span class="flex gap-2">
    <Button variant="outline" class="h-9 font-semibold" onclick={() => void create()}>Create lobby</Button>
    <Button variant="ghost" href="#/join" class="h-9">Join</Button>
  </span>
</div>
