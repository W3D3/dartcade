<script lang="ts">
  // The host's next-game card: the game (its settings with the Play page's form, Change game
  // with its mode tiles), who plays, throw order and Start.
  import { ArrowRight } from '@lucide/svelte'
  import { untrack } from 'svelte'
  import type { Lobby, TeamId, ThrowOrder } from '$lib/api/lobby-ws'
  import { Button } from '$lib/components/ui/button/index.js'
  import ChangeGameDialog from './ChangeGameDialog.svelte'
  import NextGameSettingsPanel from './NextGameSettingsPanel.svelte'
  import NextGameSummary from './NextGameSummary.svelte'
  import ReadyCount from './ReadyCount.svelte'
  import SettingsToggleButton from './SettingsToggleButton.svelte'
  import TeamsPanel from './TeamsPanel.svelte'
  import ThrowOrderField from './ThrowOrderField.svelte'
  import WhoPlays from './WhoPlays.svelte'
  import { gameModes, settlePending, withDefaults } from '$lib/gameModes'
  import { counts, isTeamFormat, type LobbyPatch, type PersonPatch } from '$lib/lobby/rules'

  let {
    lobby,
    busy = false,
    onupdate,
    onplays,
    onteammove,
    onteamplace,
    onteamshuffle,
    onstart,
  }: {
    lobby: Lobby
    /** A start is in flight: Start waits. */
    busy?: boolean
    onupdate: (patch: LobbyPatch) => Promise<boolean>
    onplays: (personId: string, plays: boolean) => Promise<boolean>
    onteammove: (personId: string, team: TeamId) => Promise<boolean>
    /** A dragged player's new team and place. */
    onteamplace: (personId: string, patch: PersonPatch) => Promise<boolean>
    onteamshuffle: () => Promise<boolean>
    onstart: () => void
  } = $props()

  const c = $derived(counts(lobby))
  const game = $derived(lobby.nextGame)
  const running = $derived(lobby.currentSessionId !== null)
  const info = $derived(game ? $gameModes.find(g => g.id === game.gameId) : undefined)
  const defaults = $derived(info?.defaultConfig ?? {})
  type Config = Record<string, unknown>
  // Changes sent but not yet in the lobby's snapshot, for the game they were made on: shown
  // and sent on top of it, so two quick changes don't undo each other
  let pending = $state<{ gameId: string; config: Config } | null>(null)
  // Changes whose save came back (the values sent): the next snapshot settles them. Plain:
  // only the snapshot effect reads it
  let settled: Config = {}
  // What the form shows: the lobby's saved settings and the pending changes over the mode's defaults
  const config = $derived(
    game ? withDefaults({ ...game.config, ...(pending?.gameId === game.gameId ? pending.config : {}) }, defaults) : {},
  )
  let picking = $state(false)
  let settingsOpen = $state(false)
  const teamGame = $derived(isTeamFormat(info?.teams, config))

  // Each snapshot settles the pending changes it shows (or whose save came back). This only
  // trims what's shown: saving happens in the handlers, so an echo never saves again.
  $effect(() => {
    const g = game
    untrack(() => {
      if (!pending) return
      if (!g || g.gameId !== pending.gameId) {
        pending = null
        settled = {}
        return
      }
      const left = settlePending(pending.config, g.config, settled)
      settled = {}
      pending = Object.keys(left).length > 0 ? { gameId: g.gameId, config: left } : null
    })
  })

  // Read fresh (a snapshot may have settled it while a save was on its way)
  function pendingValue(gameId: string, key: string): unknown {
    return pending?.gameId === gameId ? pending.config[key] : undefined
  }

  // Each change saves the whole next game, pending changes included
  async function setConfig(key: string, value: unknown) {
    if (!game) return
    const gameId = game.gameId
    const sent = { ...config, [key]: value }
    pending = { gameId, config: { ...(pending?.gameId === gameId ? pending.config : {}), [key]: value } }
    const ok = await onupdate({ nextGame: { gameId, config: sent } })
    // A newer change to it (or another game) took over: that one settles it
    if (pendingValue(gameId, key) !== value) return
    if (ok) settled = { ...settled, [key]: value }
    else {
      // Refused (the error shows on the page): back to what the lobby has
      const left = settlePending(pending.config, {}, { [key]: value })
      pending = Object.keys(left).length > 0 ? { gameId, config: left } : null
    }
  }
  function pickGame(gameId: string) {
    picking = false
    pending = null
    settled = {}
    const defaultConfig = $gameModes.find(g => g.id === gameId)?.defaultConfig ?? {}
    void onupdate({ nextGame: { gameId, config: { ...defaultConfig } } })
  }
</script>

<section
  aria-label="Next game"
  class="box-border p-4 md:px-6 md:py-[22px] rounded-[14px] bg-surface-active border-2 border-accent flex flex-col gap-[14px] md:gap-[18px]"
>
  <NextGameSummary {lobby} pickedBy="picked by you" />
  <div class="grid grid-cols-2 gap-2">
    {#if game}
      <SettingsToggleButton open={settingsOpen} ontoggle={() => (settingsOpen = !settingsOpen)} />
    {/if}
    <Button
      variant="outline"
      size="md"
      class="font-semibold {game ? '' : 'col-span-2'}"
      aria-haspopup="dialog"
      onclick={() => (picking = true)}>{game ? 'Change game' : 'Pick a game'}</Button
    >
  </div>
  {#if game}
    <NextGameSettingsPanel
      open={settingsOpen}
      gameId={game.gameId}
      {config}
      {defaults}
      meta={info?.configMeta ?? {}}
      teams={info?.teams ?? false}
      onchange={(key: string, value: unknown) => void setConfig(key, value)}
    />
  {/if}
  {#if teamGame}
    <TeamsPanel
      {lobby}
      editable
      onmove={(personId: string, team: TeamId) => void onteammove(personId, team)}
      onplace={onteamplace}
      onshuffle={() => void onteamshuffle()}
    />
  {:else}
    <WhoPlays {lobby} onplays={(personId: string, plays: boolean) => void onplays(personId, plays)} />
  {/if}
  <ThrowOrderField {lobby} gameId={game?.gameId ?? null} onchange={(throwOrder: ThrowOrder) => void onupdate({ throwOrder })} />
  <div class="flex flex-col gap-[6px]">
    <Button size="xl" class="w-full" disabled={!game || running || busy} onclick={() => onstart()}>
      Start · {c.playing}
      {c.playing === 1 ? 'player' : 'players'}<ArrowRight size={20} strokeWidth={2.2} />
    </Button>
    <span class="text-[13px]"><ReadyCount {lobby} suffix="you can start anyway" /></span>
  </div>
</section>

{#if picking}
  <ChangeGameDialog current={game?.gameId ?? null} games={$gameModes} onpick={pickGame} oncancel={() => (picking = false)} />
{/if}
