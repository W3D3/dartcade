// What the progression screens show: levels, bars and the XP breakdown, from the shared rules.
import { levelOf } from '$shared/progression.js'
import type { XpLine } from '$lib/api/lobby-ws'

const nf = new Intl.NumberFormat('en-US')
export const fmtXp = (n: number): string => nf.format(n)

export type LevelView = {
  level: number
  /** 0-100: how far into the level. */
  pct: number
  /** '220 XP to go' */
  toGo: string
  xp: number
}

export function levelView(xp: number): LevelView {
  const p = levelOf(xp)
  return { level: p.level, pct: (p.into / p.cost) * 100, toGo: `${fmtXp(p.toGo)} XP to go`, xp }
}

/** The win screen chip's bar: where it starts and ends, and whether it runs past a level. */
export type ChipMotion = { from: number; to: number; levelBefore: number; levelAfter: number; levelUp: boolean }

export function chipMotion(xpBefore: number, xpAfter: number): ChipMotion {
  const a = levelView(xpBefore)
  const b = levelView(xpAfter)
  return { from: a.pct, to: b.pct, levelBefore: a.level, levelAfter: b.level, levelUp: b.level > a.level }
}

const LABELS: Record<XpLine['kind'], string> = {
  dart: 'Darts thrown',
  game: 'Game finished',
  win: 'Win',
  ranked: 'Ranked match',
  oneEighty: '180',
  checkout: 'Checkout of 100+',
  personalBest: 'Personal best',
  daily: 'First game of the day',
  challenge: 'Challenge',
  milestone: 'Streak milestone',
}

/** 'Darts thrown · 42', '180 × 2', 'Win' */
export function lineLabel(line: XpLine): string {
  const label = LABELS[line.kind]
  if (line.count === undefined) return label
  if (line.kind === 'dart') return `${label} · ${line.count}`
  return line.count > 1 ? `${label} × ${line.count}` : label
}
