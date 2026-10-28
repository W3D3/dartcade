// What the match screen shows for X01 and Around the Clock, derived from a snapshot: the seats'
// views, the open visit's slots and band, the board's highlights. GameDisplay and the big screen
// both call this, so the two screens show the same things.
import type { PillKind } from './components/pills.js'
import { atcTargetSegment, atcLeaders } from './atc.js'
import { boardCheckoutTargets, atcSlots, x01Slots } from './dartSlots.js'
import { initial } from './fmt.js'
import type { GameSettings } from './gameSettings.js'
import { gameState } from './gameState.js'
import { atcPlayer, x01Player } from './playerStats.js'
import { x01Teams } from './teams.js'
import type { VisitHistory } from './visitHistory.js'
import { atcAdvanced, atcBand, bigDartIndex, x01Band } from './visitBand.js'
import type { Snapshot } from './ws.js'

export type MatchSettings = Pick<GameSettings, 'checkoutSuggestions' | 'favouriteDouble' | 'scoreUpdates' | 'showMarkers'>

export type LegendItem = { label: string; kind: 'current' | 'next' | 'others' }

export function matchView(snapshot: Snapshot | null, history: VisitHistory, settings: MatchSettings) {
  const { x01, atc, minigolf, p121, hilo } = gameState(snapshot)
  const game = x01 ?? atc ?? minigolf ?? p121 ?? hilo
  const players = snapshot?.players ?? []
  const isX01 = x01 !== null
  const isActive = snapshot?.status === 'active'
  const currentPlayer = game?.currentPlayer ?? 0
  const winner = game?.winner ?? null
  const darts = game?.currentVisitDarts ?? []
  const hits = atc?.currentVisitHits ?? []
  const bust = x01?.bustThisVisit === true
  // Checkout preferences: this device's for now; per player once they can be set in Settings
  const checkout = { favouriteDouble: settings.favouriteDouble }
  const teams = x01 ? x01Teams(x01, players, { suggest: settings.checkoutSuggestions, checkout, scoreUpdates: settings.scoreUpdates }) : []

  // The server names who throws next (null when nobody does)
  const nextPlayer = x01?.nextPlayer ?? atc?.nextPlayer ?? null
  // Around the Clock in a duel: the other player, whose target the board and its legend show too
  const atcOther = (currentPlayer + 1) % Math.max(players.length, 1)
  const x01Players = x01
    ? players.map((_, i) =>
        x01Player(x01, i, {
          active: i === currentPlayer && isActive,
          suggest: settings.checkoutSuggestions,
          checkout,
          bust: i === currentPlayer && bust,
          scoreUpdates: settings.scoreUpdates,
        }),
      )
    : []
  const atcPlayers = atc ? players.map((_, i) => atcPlayer(atc, i)) : []
  const leaders = atcLeaders(atc?.hitCounts ?? [])

  const hitCount = atc?.hitCounts.at(currentPlayer) ?? 0
  // X01 sends where the visit started; Around the Clock still tracks it in the browser
  const visitStart = x01 ? (x01.visitStartScores.at(currentPlayer) ?? null) : (history.start.at(currentPlayer) ?? null)
  const remaining = x01Players[currentPlayer]?.remaining ?? 0
  const opened = x01Players[currentPlayer]?.opened ?? true
  const slots = isX01
    ? x01Slots({
        darts,
        outMode: x01.config.outMode,
        bust,
        remaining,
        opened,
        suggest: settings.checkoutSuggestions && isActive,
        checkout,
      })
    : atcSlots({
        darts,
        hits,
        target: isActive ? (atcPlayers[currentPlayer]?.target ?? null) : null,
        multiplierAdvances: atc?.cfg.multiplierAdvances === true,
        walk: atc && visitStart !== null ? { sequence: atc.sequence, start: visitStart } : undefined,
      })
  const band = isX01
    ? x01Band({
        darts,
        bust,
        left: remaining,
        // What the engine actually took off, when the visit's start is known
        scored: !bust && visitStart !== null ? visitStart - remaining : undefined,
      })
    : atcBand({
        dartCount: darts.length,
        advanced: atcAdvanced(hitCount, visitStart, hits),
        target: atcPlayers[currentPlayer]?.target ?? '',
      })
  // Every finished visit: the visit sum starts over at 0 without rolling
  const visitKey = (game?.totalVisits ?? []).reduce((a, v) => a + v, 0)
  const popIndex = isX01 ? bigDartIndex(darts, { opened, bust }) : null

  // Only the very next dart's suggestion is highlighted on the board itself; later darts in
  // the chain only show in the dart slots below it.
  const sequence = atc?.sequence ?? []
  const targets = atc?.targets ?? []
  const boardTarget = !isX01 && isActive ? atcTargetSegment(sequence, targets.at(currentPlayer)) : null
  const boardNext = !isX01 && isActive && players.length === 2 ? atcTargetSegment(sequence, targets.at(atcOther)) : null
  const markers =
    !isX01 && isActive && players.length > 2 && settings.showMarkers
      ? players
          .map((p, i) => ({
            initial: initial(p.name),
            segment: atcTargetSegment(sequence, targets.at(i)) ?? 0,
            isActive: i === currentPlayer,
          }))
          .filter(m => m.segment > 0)
      : []
  const legend: LegendItem[] = (() => {
    if (isX01 || !isActive || players.length === 1) return []
    if (players.length > 2)
      return settings.showMarkers
        ? [
            { label: 'Current target', kind: 'current' },
            { label: "Others' targets", kind: 'others' },
          ]
        : [{ label: 'Current target', kind: 'current' }]
    return [
      { label: `${players[currentPlayer]?.name} · ${atcPlayers[currentPlayer]?.target}`, kind: 'current' },
      { label: `${players[atcOther]?.name} · ${atcPlayers[atcOther]?.target}`, kind: 'next' },
    ]
  })()

  function pillFor(i: number, rows: boolean): PillKind | null {
    if (winner === i) return 'winner'
    if (!isActive) return null
    if (players.length === 1) return 'practice'
    if (i === currentPlayer) return 'throwing'
    if (rows && leaders.includes(i)) return 'leading'
    return i === nextPlayer ? 'up-next' : null
  }

  return {
    checkout,
    teams,
    atcOther,
    nextPlayer,
    x01Players,
    atcPlayers,
    slots,
    band,
    visitKey,
    popIndex,
    checkoutTargets: boardCheckoutTargets(slots, isX01),
    boardTarget,
    boardNext,
    markers,
    legend,
    pillFor,
  }
}
