// A step in words, as the missions list, the builder and the play screen title it
// ("Hit S20 9 times in a row", "D11 → Bull → D6", "1–20 + Bull within 40 darts").
import type { Step, StepOf, Target } from './types.js'

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

export const targetLabel = (t: Target): string => (t === 'B' ? 'Bull' : t === 'DB' ? 'Inner bull' : t)

// Runs of three or more consecutive bare numbers read as a range ("1–20"); the bull goes last as "+ Bull"
function listLabel(labels: { n: number | null; text: string }[], sep: string): string {
  const parts: string[] = []
  const follows = (j: number) => {
    const n = labels[j].n
    return n !== null && labels[j + 1]?.n === n + 1
  }
  for (let i = 0; i < labels.length;) {
    let j = i
    while (follows(j)) j++
    if (j - i >= 2) {
      parts.push(`${labels[i].text}–${labels[j].text}`)
      i = j + 1
    } else {
      parts.push(labels[i].text)
      i++
    }
  }
  const last = parts.at(-1)
  if (parts.length > 1 && last === 'Bull' && parts.at(-2)?.includes('–')) return `${parts.slice(0, -1).join(sep)} + Bull`
  return parts.join(sep)
}

const bare = (t: Target) => (/^\d+$/.test(t) ? Number(t) : null)
const targetsLabel = (targets: Target[], sep: string) =>
  listLabel(
    targets.map(t => ({ n: bare(t), text: targetLabel(t) })),
    sep,
  )
const numbersLabel = (targets: number[]) =>
  listLabel(
    targets.map(n => ({ n: n === 25 ? null : n, text: n === 25 ? 'Bull' : String(n) })),
    ', ',
  )

const within = (w: number | 'visit' | undefined) =>
  w === undefined ? '' : w === 'visit' ? ' in one visit' : ` within ${plural(w, 'dart')}`

const EVERY: Record<string, string> = { D: 'double', T: 'treble', S: 'single' }

// Every number 1–20 in one ring ("every double")
function everyRing(targets: Target[]): string | null {
  const ring = targets[0]?.[0]
  if (!ring || !EVERY[ring] || targets.length !== 20) return null
  return targets.every(t => t[0] === ring) && new Set(targets.map(t => t.slice(1))).size === 20 ? EVERY[ring] : null
}

function hitTitle(s: StepOf<'hit'>): string {
  const w = within(s.within)
  if (s.targets.length === 1) {
    const t = s.targets[0]
    const row = s.inARow ? ' in a row' : ''
    if (s.hits === 1) return `Hit ${targetLabel(t)}${w}`
    if (t === 'B' || t === 'DB') return `Hit ${s.hits} ${t === 'B' ? 'bulls' : 'inner bulls'}${row}${w}`
    return `Hit ${targetLabel(t)} ${s.hits} times${row}${w}`
  }
  const each = s.hits === 1 ? 'once' : `${s.hits} times`
  const ring = everyRing(s.targets)
  if (ring && s.order === 'any') return `Hit every ${ring} ${each}${w}`
  const list = targetsLabel(s.targets, s.order === 'in_order' ? ' → ' : ', ')
  return `${list}${s.hits === 1 ? '' : ` ×${s.hits}`}${s.inARow ? ' in a row' : ''}${w}`
}

function marksTitle(s: StepOf<'marks'>): string {
  const w = s.within === undefined ? '' : ` in ${plural(s.within, 'dart')}`
  const list = numbersLabel(s.targets)
  if (s.per === 'each' && s.marks === 3 && s.targets.length > 1) return `Close ${list}${w}`
  const on = s.per === 'each' && s.targets.length > 1 ? `each of ${list}` : list
  return `${plural(s.marks, 'mark')} on ${on}${w}`
}

function visitsTitle(s: StepOf<'visits'>): string {
  const n = `${plural(s.visits, 'visit')}${s.inARow ? ' in a row' : ''}`
  switch (s.compare) {
    case 'at_least':
      return `Score ${s.points}+ in ${n}`
    case 'at_most':
      return `Score ${s.points} or less in ${n}`
    case 'exactly':
      return `Score exactly ${s.points} in ${n}`
    case 'not':
      return `Never ${s.points} in ${n}`
  }
}

/** The step's title. */
export function stepTitle(step: Step): string {
  switch (step.type) {
    case 'checkout':
      return `Check out ${step.start} in ${plural(step.maxDarts, 'dart')}`
    case 'hit':
      return hitTitle(step)
    case 'marks':
      return marksTitle(step)
    case 'visits':
      return visitsTitle(step)
    case 'score':
      return `Score ${step.points}+ within ${plural(step.within, 'dart')}`
    case 'average':
      return `Keep a ${step.average} average over ${plural(step.visits, 'visit')}`
    case 'leg':
      return `Win a ${step.start} leg within ${plural(step.within, 'dart')}`
  }
}

const FINISH = { double: 'double out', single: 'single out', master: 'master out' } as const

/** The step's type and rules, the line under its title ("Checkout · in 8 darts or fewer · double out"). */
export function stepDetail(step: Step): string {
  switch (step.type) {
    case 'checkout':
      return `Checkout · in ${plural(step.maxDarts, 'dart')} or fewer · ${FINISH[step.finish]}`
    case 'hit':
      return [
        'Hit targets',
        step.inARow ? 'a miss resets the streak' : null,
        step.targets.length > 1 && step.order === 'in_order' ? 'in this order' : null,
        step.within === 'visit' ? 'one visit' : step.within === undefined ? null : `within ${plural(step.within, 'dart')}`,
      ]
        .filter(x => x !== null)
        .join(' · ')
    case 'marks':
      return `Marks · ${step.per === 'each' ? 'on each target' : 'in total'}${step.within === undefined ? '' : ` · within ${plural(step.within, 'dart')}`}`
    case 'visits':
      return `Visits · ${step.inARow ? 'in a row' : 'any'} · a bust counts as 0`
    case 'score':
      return `Score · within ${plural(step.within, 'dart')}`
    case 'average':
      return `Average · 3-dart average over ${plural(step.visits, 'visit')}`
    case 'leg':
      return `Fast leg · ${FINISH[step.finish]}`
  }
}
