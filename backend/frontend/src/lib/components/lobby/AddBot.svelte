<script lang="ts">
  // "+ Bot": a small popover to pick a difficulty (1-10) and add a bot seat. Sits next to
  // AddSomeone; unlike it, there's no text to type — just a level.
  import { Bot } from '@lucide/svelte'
  import { Button } from '$lib/components/ui/button/index.js'
  import MenuItem from './MenuItem.svelte'
  import PopoverPanel from './PopoverPanel.svelte'

  let { onbot }: { onbot: (level: number) => Promise<boolean> } = $props()

  let open = $state(false)
  let form: HTMLDivElement | undefined = $state()

  async function pick(level: number) {
    if (await onbot(level)) open = false
  }

  function outside(e: PointerEvent) {
    if (open && form && e.target instanceof Node && !form.contains(e.target)) open = false
  }
</script>

<svelte:window onpointerdown={outside} />

<div bind:this={form} class="relative">
  <Button variant="outline" size="md" type="button" class="bg-surface-key border-0 font-semibold" onclick={() => (open = !open)}>
    <Bot size={16} />Add bot
  </Button>
  {#if open}
    <PopoverPanel label="Bot difficulty" align="stretch">
      {#each Array.from({ length: 10 }, (_, i) => i + 1) as level (level)}
        <MenuItem label="Level {level}" onclick={() => void pick(level)} />
      {/each}
    </PopoverPanel>
  {/if}
</div>
