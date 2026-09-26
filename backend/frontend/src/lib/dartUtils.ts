const SEGS = [20,1,18,4,13,6,10,15,2,17,3,19,7,16,8,11,14,9,12,5]
const R = { bull50: 0.037, bull25: 0.094, si: 0.582, tr: 0.629, so: 0.953, db: 1.000 }

export function parseLabel(label: string): { mult: number; num: number; score: number } {
  if (label === 'Miss') return { mult: 0, num: 0, score: 0 }
  if (label === 'Bull') return { mult: 2, num: 25, score: 50 }
  if (label === '25')   return { mult: 1, num: 25, score: 25 }
  const mult = ({ S: 1, D: 2, T: 3 } as Record<string, number>)[label[0]] ?? 1
  const num  = parseInt(label.slice(1), 10)
  return { mult, num, score: mult * num }
}

/** SVG-space coords (y increases downward, r=1 at double wire). */
export function labelPos(label: string): { x: number; y: number } | null {
  if (label === 'Miss') return null
  if (label === 'Bull') return { x: 0, y: 0 }
  if (label === '25')   return { x: 0, y: -(R.bull50 + R.bull25) / 2 }
  const { mult, num } = parseLabel(label)
  const si = SEGS.indexOf(num)
  if (si < 0) return null
  const angle = Math.PI / 2 - si * (Math.PI / 10)
  const r = mult === 3 ? (R.si + R.tr) / 2
          : mult === 2 ? (R.so + R.db) / 2
          : (R.tr + R.so) / 2
  return { x: r * Math.cos(angle), y: -(r * Math.sin(angle)) }
}

export function nearbyPicks(label: string): string[] {
  const { num } = parseLabel(label)
  const out: string[] = []
  const add = (l: string) => { if (l !== label && !out.includes(l)) out.push(l) }
  if (num === 25) {
    add('Bull'); add('25'); add('S20'); add('S3'); add('S6'); add('S11')
    return [...out.slice(0, 6), 'Miss']
  }
  const i = SEGS.indexOf(num)
  const L = SEGS[(i + 19) % 20], Ri = SEGS[(i + 1) % 20]
  const ring = label[0]
  ;['S','T','D'].forEach(k => add(`${k}${num}`))
  add(`${ring}${L}`); add(`${ring}${Ri}`); add(`S${L}`); add(`S${Ri}`)
  return [...out.slice(0, 6), 'Miss']
}

type OutMode = 'straight' | 'double' | 'master'

export function checkoutHint(remaining: number, outMode: OutMode = 'double', dartsLeft = 3): string[] | null {
  if (remaining < 1 || remaining > 170) return null
  const n = Math.min(dartsLeft, 3)

  // Valid finishing darts
  const finishMap = new Map<number, string>()
  if (outMode === 'straight') {
    for (let k = 20; k >= 1; k--) {
      finishMap.set(3*k, `T${k}`)
      finishMap.set(2*k, `D${k}`)
      finishMap.set(k,   `S${k}`)
    }
    finishMap.set(50, 'Bull')
    finishMap.set(25, '25')
  } else if (outMode === 'master') {
    for (let k = 20; k >= 1; k--) { finishMap.set(3*k, `T${k}`); finishMap.set(2*k, `D${k}`) }
    finishMap.set(50, 'Bull')
  } else {
    // double out
    for (let k = 20; k >= 1; k--) finishMap.set(2*k, `D${k}`)
    finishMap.set(50, 'Bull')
  }

  // 1-dart finish
  if (n >= 1 && finishMap.has(remaining)) return [finishMap.get(remaining)!]

  // Scoring darts (preferred order: triples high→low, then singles, then bull)
  const scoring: { l: string; v: number }[] = []
  for (let k = 20; k >= 1; k--) scoring.push({ l: `T${k}`, v: 3*k })
  for (let k = 20; k >= 1; k--) scoring.push({ l: `S${k}`, v: k })
  scoring.push({ l: '25', v: 25 }, { l: 'Bull', v: 50 })

  // 2-dart finish
  if (n >= 2) {
    for (const d of scoring) {
      const rest = remaining - d.v
      if (rest >= 1 && finishMap.has(rest)) return [d.l, finishMap.get(rest)!]
    }
  }

  // 3-dart finish
  if (n >= 3) {
    for (const d1 of scoring) {
      const r1 = remaining - d1.v
      if (r1 < 2) continue
      for (const d2 of scoring) {
        const r2 = r1 - d2.v
        if (r2 >= 1 && finishMap.has(r2)) return [d1.l, d2.l, finishMap.get(r2)!]
      }
    }
  }

  return null
}
