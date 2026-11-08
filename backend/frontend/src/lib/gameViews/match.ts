// The match screen of each game mode: GameDisplay and the big screen both draw it through MatchScreen.
import type { Component } from 'svelte'
import type { GameId } from '$shared/gameNames'
import ScoreMatch from '$lib/components/ScoreMatch.svelte'
import CricketScreen from '$lib/components/match/screens/CricketScreen.svelte'
import HiloScreen from '$lib/components/match/screens/HiloScreen.svelte'
import MinigolfScreen from '$lib/components/match/screens/MinigolfScreen.svelte'
import P121Screen from '$lib/components/match/screens/P121Screen.svelte'
import type { MatchProps } from '$lib/components/match/types'

/** One entry per mode, so a new game id fails to compile here until it has a match screen. */
export const MATCH_SCREENS: Record<GameId, Component<MatchProps>> = {
  x01: ScoreMatch,
  atc: ScoreMatch,
  minigolf: MinigolfScreen,
  p121: P121Screen,
  hilo: HiloScreen,
  cricket: CricketScreen,
}
