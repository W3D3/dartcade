<script lang="ts">
  // The host's next-game card: the game (with inline X01 settings), who plays, throw order,
  // Start, and Rematch once a game was played.
  import { ArrowRight, RotateCcw, Settings } from '@lucide/svelte'
  import type { Lobby, ThrowOrder } from '$lib/api/lobby-ws'
  import { Button } from '$lib/components/ui/button/index.js'
  import SegmentedControl from '$lib/components/SegmentedControl.svelte'
  import Field from './Field.svelte'
  import NextGameSummary from './NextGameSummary.svelte'
  import ReadyCount from './ReadyCount.svelte'
  import WhoPlays from './WhoPlays.svelte'
  import X01Settings from './X01Settings.svelte'
  import { bullOffAvailable, counts, type LobbyPatch } from '$lib/lobby/rules'

  let { lobby, busy = false, onupdate, onplays, onstart }: {
    lobby: Lobby
    /** A start is in flight: Start and Rematch wait. */
    busy?: boolean
    onupdate: (patch: LobbyPatch) => Promise<boolean>
    onplays: (personId: string, plays: boolean) => Promise<boolean>
    onstart: (rematch: boolean) => void
  } = $props()

  const isOrder = (v: unknown): v is ThrowOrder => v === 'lobby' || v === 'random' || v === 'bulloff'

  const c = $derived(counts(lobby))
  const game = $derived(lobby.nextGame)
  const bullOff = $derived(bullOffAvailable(lobby))
  const orders = $derived([
    { value: 'lobby', label: 'Lobby order' },
    { value: 'random', label: 'Random' },
    { value: 'bulloff', label: 'Bull-off', disabled: !bullOff,
      title: bullOff ? undefined : game?.gameId === 'x01' ? 'Bull-off needs at least two players' : 'This game has no bull off' },
  ])
  const x01 = $derived(game?.gameId === 'x01')
  const running = $derived(lobby.currentSessionId !== null)
  let settingsOpen = $state(false)

  function setConfig(key: string, value: unknown) {
    if (game) void onupdate({ nextGame: { gameId: game.gameId, config: { ...game.config, [key]: value } } })
  }
</script>

<section aria-label="Next game"
  class="box-border p-4 md:px-6 md:py-[22px] rounded-[14px] bg-surface-active border-2 border-accent flex flex-col gap-[14px] md:gap-[18px]">
  <NextGameSummary {game} pickedBy="picked by you" />
  <div class="grid grid-cols-2 gap-2">
    {#if x01}
      <Button variant="outline" class="h-11 font-semibold {settingsOpen ? 'bg-[#2b3417]' : ''}" aria-expanded={settingsOpen}
        onclick={() => settingsOpen = !settingsOpen}><Settings size={16} />Settings</Button>
    {/if}
    <Button variant="outline" href="#/" class="h-11 font-semibold {x01 ? '' : 'col-span-2'}">{game ? 'Change game' : 'Pick a game'}</Button>
  </div>
  {#if settingsOpen && game && x01}<X01Settings config={game.config} onchange={setConfig} />{/if}
  <WhoPlays {lobby} onplays={(personId: string, plays: boolean) => void onplays(personId, plays)} />
  <Field label="Throw order">
    <SegmentedControl options={orders} value={lobby.throwOrder} onchange={(v) => { if (isOrder(v)) void onupdate({ throwOrder: v }) }} />
  </Field>
  <div class="flex flex-col gap-[6px]">
    <div class="flex gap-2">
      <Button class="flex-grow h-14" disabled={!game || running || busy || c.playing === 0} onclick={() => onstart(false)}>
        Start · {c.playing} {c.playing === 1 ? 'player' : 'players'}<ArrowRight size={20} strokeWidth={2.2} />
      </Button>
      {#if lobby.canRematch}
        <Button variant="outline" class="h-14 font-semibold" disabled={running || busy} aria-label="Rematch: the last game again, same players"
          onclick={() => onstart(true)}><RotateCcw size={18} />Rematch</Button>
      {/if}
    </div>
    <span class="text-[13px]"><ReadyCount {lobby} suffix="you can start anyway" /></span>
  </div>
</section>
