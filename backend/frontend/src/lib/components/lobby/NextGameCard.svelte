<script lang="ts">
  // The host's next-game card: the game (with inline X01 settings), who plays, throw order,
  // Start, and Rematch once a game was played.
  import { ArrowRight, RotateCcw, Settings } from '@lucide/svelte'
  import type { Lobby, ThrowOrder } from '$lib/api/lobby-ws'
  import { Button } from '$lib/components/ui/button/index.js'
  import NextGameSummary from './NextGameSummary.svelte'
  import ReadyCount from './ReadyCount.svelte'
  import ThrowOrderField from './ThrowOrderField.svelte'
  import WhoPlays from './WhoPlays.svelte'
  import X01Settings from './X01Settings.svelte'
  import { counts, type LobbyPatch } from '$lib/lobby/rules'

  let { lobby, busy = false, onupdate, onplays, onstart }: {
    lobby: Lobby
    /** A start is in flight: Start and Rematch wait. */
    busy?: boolean
    onupdate: (patch: LobbyPatch) => Promise<boolean>
    onplays: (personId: string, plays: boolean) => Promise<boolean>
    onstart: (rematch: boolean) => void
  } = $props()

  const c = $derived(counts(lobby))
  const game = $derived(lobby.nextGame)
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
      <Button variant="outline" size="md" pressed={settingsOpen} class="font-semibold" aria-expanded={settingsOpen}
        onclick={() => settingsOpen = !settingsOpen}><Settings size={16} />Settings</Button>
    {/if}
    <Button variant="outline" size="md" href="#/" class="font-semibold {x01 ? '' : 'col-span-2'}">{game ? 'Change game' : 'Pick a game'}</Button>
  </div>
  {#if settingsOpen && game && x01}<X01Settings config={game.config} onchange={setConfig} />{/if}
  <WhoPlays {lobby} onplays={(personId: string, plays: boolean) => void onplays(personId, plays)} />
  <ThrowOrderField {lobby} gameId={game?.gameId ?? null} onchange={(throwOrder: ThrowOrder) => void onupdate({ throwOrder })} />
  <div class="flex flex-col gap-[6px]">
    <div class="flex gap-2">
      <Button size="xl" class="flex-grow" disabled={!game || running || busy || c.playing === 0} onclick={() => onstart(false)}>
        Start · {c.playing} {c.playing === 1 ? 'player' : 'players'}<ArrowRight size={20} strokeWidth={2.2} />
      </Button>
      {#if lobby.canRematch}
        <Button variant="outline" size="xl" class="font-semibold" disabled={running || busy} aria-label="Rematch: the last game again, same players"
          onclick={() => onstart(true)}><RotateCcw size={18} />Rematch</Button>
      {/if}
    </div>
    <span class="text-[13px]"><ReadyCount {lobby} suffix="you can start anyway" /></span>
  </div>
</section>
