<script lang="ts">
  // "+ Bot": a small popover to pick a difficulty (1-20) with a slider and add a bot seat. Sits
  // next to AddSomeone; unlike it, there's no text to type — just a level.
  import { Bot } from '@lucide/svelte'
  import { Button } from '$lib/components/ui/button/index.js'
  import { Slider } from '$lib/components/ui/slider/index.js'
  import { LEVEL_AVERAGE, botLevelLabel } from '$shared/botLevels.js'
  import Avatar from '$lib/components/Avatar.svelte'
  import PopoverPanel from './PopoverPanel.svelte'
  import { Popover } from 'bits-ui'

  let { gameId, onbot }: { gameId?: string; onbot: (level: number) => Promise<boolean> } = $props()

  let open = $state(false)
  let level = $state(Math.ceil(LEVEL_AVERAGE.length / 2))

  async function add() {
    if (await onbot(level)) open = false
  }
</script>

<Popover.Root bind:open>
  <Popover.Trigger aria-haspopup="dialog">
    {#snippet child({ props })}
      <Button {...props} variant="outline" size="md" type="button" class="bg-surface-key border-0 font-semibold">
        <Bot size={16} />Add bot
      </Button>
    {/snippet}
  </Popover.Trigger>
  <PopoverPanel label="Bot difficulty" role="dialog" width={240}>
    <div class="flex flex-col gap-3 p-2">
      <div class="flex items-center gap-3">
        <Avatar name="Level {level}" face={{ avatar: { kind: 'none' }, userId: null, bot: { level } }} size={36} />
        <div class="flex flex-col leading-tight">
          <span id="bot-level-name" class="text-[14px] font-semibold text-text">Level {level}</span>
          {#if gameId === 'x01'}
            <span class="text-[12px] text-text-dim">{botLevelLabel(level, gameId)}</span>
          {/if}
        </div>
      </div>
      <Slider bind:value={level} min={1} max={LEVEL_AVERAGE.length} labelledby="bot-level-name" />
      <Button variant="outline" size="md" type="button" class="bg-surface-key border-0 font-semibold" onclick={() => void add()}
        >Add Level {level}</Button
      >
    </div>
  </PopoverPanel>
</Popover.Root>
