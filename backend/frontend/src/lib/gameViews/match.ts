// The match screen of each game mode: GameDisplay and the big screen both draw it through MatchScreen.
import type { Component } from 'svelte'
import type { GameId } from '$shared/gameNames'
import ScoreMatch from '$lib/components/ScoreMatch.svelte'
import DungeonScene from '$lib/components/dungeon/DungeonScene.svelte'
import CricketScreen from '$lib/components/match/screens/CricketScreen.svelte'
import HiloScreen from '$lib/components/match/screens/HiloScreen.svelte'
import MinigolfScreen from '$lib/components/match/screens/MinigolfScreen.svelte'
import MissionScreen from '$lib/components/match/screens/MissionScreen.svelte'
import Catch40Screen from '$lib/components/match/screens/Catch40Screen.svelte'
import ShanghaiScreen from '$lib/components/match/screens/ShanghaiScreen.svelte'
import P121Screen from '$lib/components/match/screens/P121Screen.svelte'
import type { MatchProps } from '$lib/components/match/types'

/** One entry per mode, so a new game id fails to compile here until it has a match screen. */
export const MATCH_SCREENS: Record<GameId, Component<MatchProps>> = {
  x01: ScoreMatch,
  atc: ScoreMatch,
  minigolf: MinigolfScreen,
  p121: P121Screen,
  catch40: Catch40Screen,
  hilo: HiloScreen,
  cricket: CricketScreen,
  mission: MissionScreen,
  shanghai: ShanghaiScreen,
  dungeon: DungeonScene,
}
