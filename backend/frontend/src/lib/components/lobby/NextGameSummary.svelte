<script lang="ts">
  // The next game at a glance: the big number (X01's start score, or the mode), whose pick,
  // the mode and its settings (over the game's defaults, for anything the lobby didn't save),
  // after "Teams 2v2" in a team game.
  import type { Lobby } from '$lib/api/lobby-ws'
  import { gameModes, withDefaults } from '$lib/gameModes'
  import { gameName, nextGameSummary } from '$lib/lobby/format'
  import { nextGameInTeams, teamRosters } from '$lib/lobby/rules'

  let { lobby, pickedBy, size = 'lg' }: { lobby: Lobby; pickedBy: string; size?: 'lg' | 'sm' } = $props()
  const game = $derived(lobby.nextGame)
  const info = $derived(game ? $gameModes.find(g => g.id === game.gameId) : undefined)
  const defaults = $derived(info?.defaultConfig ?? {})
  const config = $derived(game ? withDefaults(game.config, defaults) : {})
  const teamSizes = $derived.by(() => {
    if (!nextGameInTeams(lobby, $gameModes)) return null
    const { a, b } = teamRosters(lobby)
    return [a.length, b.length]
  })
  const big = $derived(game?.gameId === 'x01' && typeof config.startScore === 'number'
    ? String(config.startScore)
    : game ? game.gameId.toUpperCase() : '—')
</script>

<div class="flex items-start gap-[14px] md:gap-[18px]">
  <span class="font-display font-bold leading-[0.85] text-accent {size === 'lg' ? 'text-[52px] md:text-[72px]' : 'text-[44px]'}">{big}</span>
  <div class="flex flex-col gap-[2px] md:gap-1 flex-grow min-w-0">
    <span class="text-[11px] md:text-[12px] tracking-[0.1em] uppercase text-text-muted">Next game · {pickedBy}</span>
    <h3 class="m-0 font-display font-bold leading-none uppercase {size === 'lg' ? 'text-[24px] md:text-[32px]' : 'text-[20px]'}">{game ? gameName(game.gameId) : 'No game yet'}</h3>
    {#if game}<span class="text-[13px] md:text-[15px] text-ink-2">{nextGameSummary(game, defaults, teamSizes)}</span>{/if}
  </div>
</div>
