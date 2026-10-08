<script lang="ts">
  // "+ Bot": a small popover to pick a difficulty (1-10) and add a bot seat. Sits next to
  // AddSomeone; unlike it, there's no text to type — just a level.
  import { Bot } from '@lucide/svelte'
  import { Button } from '$lib/components/ui/button/index.js'
  import { averageForLevel } from '$shared/botLevels.js'
  import Avatar from '$lib/components/Avatar.svelte'
  import MenuItem from './MenuItem.svelte'
  import PopoverPanel from './PopoverPanel.svelte'
  import { Popover } from 'bits-ui'

  let { onbot }: { onbot: (level: number) => Promise<boolean> } = $props()

  let open = $state(false)

  async function pick(level: number) {
    if (await onbot(level)) open = false
  }
</script>

<Popover.Root bind:open>
  <Popover.Trigger aria-haspopup="menu">
    {#snippet child({ props })}
      <Button {...props} variant="outline" size="md" type="button" class="bg-surface-key border-0 font-semibold">
        <Bot size={16} />Add bot
      </Button>
    {/snippet}
  </Popover.Trigger>
  <PopoverPanel label="Bot difficulty" width={200}>
    {#each Array.from({ length: 10 }, (_, i) => i + 1) as level (level)}
      <MenuItem label="Level {level}" detail="{averageForLevel(level)} avg" onclick={() => void pick(level)}>
        {#snippet leading()}
          <Avatar name="Level {level}" bot={{ level }} size={28} />
        {/snippet}
      </MenuItem>
    {/each}
  </PopoverPanel>
</Popover.Root>
