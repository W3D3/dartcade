// What the progression screens show: levels, bars and the XP breakdown, from the shared rules.
import { levelOf } from '$shared/progression.js'
import type { XpGainedMessage, XpLine } from '$lib/api/lobby-ws'

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
  if (line.title) return line.title
  const label = LABELS[line.kind]
  if (line.count === undefined) return label
  if (line.kind === 'dart') return `${label} · ${line.count}`
  if (line.kind === 'daily') return `${label} · day ${line.count}`
  return line.count > 1 ? `${label} × ${line.count}` : label
}

/** 'Fri' for a YYYY-MM-DD. */
export const weekday = (date: string, style: 'short' | 'long' = 'short'): string =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: style, timeZone: 'UTC' })

/** The cosmetic a streak milestone unlocks, where it has one. */
const MILESTONE_REWARDS: Partial<Record<number, string>> = {
  7: 'flame picture',
  14: 'title Fortnight',
  30: 'gold banner',
  100: 'title Never Misses',
}

/** 'Day 14: title Fortnight', 'Day 60: +500 XP' */
export function milestoneLine(m: { days: number; xp: number }): string {
  return `Day ${m.days}: ${MILESTONE_REWARDS[m.days] ?? `+${fmtXp(m.xp)} XP`}`
}

/** A toast for progress that lands outside the win screen's chip. */
export type ProgressToast = { icon: 'freeze' | 'milestone' | 'challenge'; title: string; text: string; xp: number | null }

/** The toasts an xp.gained brings: challenges done, a freeze spent, a milestone reached. */
export function toastsFor(m: XpGainedMessage): ProgressToast[] {
  const out: ProgressToast[] = (m.challenges ?? []).map(c => ({ icon: 'challenge', title: 'Challenge complete', text: c.title, xp: c.xp }))
  const s = m.streak
  if (s?.frozeDay) {
    const left = `${s.freezes} ${s.freezes === 1 ? 'freeze' : 'freezes'} left`
    out.push({
      icon: 'freeze',
      title: 'Streak freeze used',
      text: `${weekday(s.frozeDay, 'long')} was missed. Your streak is safe. ${left}.`,
      xp: null,
    })
  }
  if (s?.milestone) {
    const xp = m.lines.find(l => l.kind === 'milestone')?.amount ?? null
    const reward = MILESTONE_REWARDS[s.milestone]
    out.push({ icon: 'milestone', title: `${s.milestone}-day streak`, text: reward ? `New: ${reward}` : 'Milestone reached', xp })
  }
  return out
}

/** The win screen's streak line, when the game was the day's first: '12-day streak', with the bonus it paid. */
export function streakLine(lines: XpLine[]): { days: number; bonus: number } | null {
  const daily = lines.find(l => l.kind === 'daily')
  return daily?.count ? { days: daily.count, bonus: daily.amount } : null
}
