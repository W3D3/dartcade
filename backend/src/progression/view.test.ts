import { describe, expect, it } from 'vitest'
import { dayStreak } from './view.js'

describe('dayStreak', () => {
  const s = { current: 12, best: 21, lastDate: '2026-10-20', freezes: 1 }

  it('shows the last 7 days, the bonus today pays and the next milestone', () => {
    const v = dayStreak(s, '2026-10-21', ['2026-10-15', '2026-10-16', '2026-10-18', '2026-10-19', '2026-10-20'], ['2026-10-17'])
    expect(v.days.map(d => d.state)).toEqual(['played', 'played', 'frozen', 'played', 'played', 'played', 'today'])
    expect(v).toMatchObject({ current: 12, best: 21, playedToday: false, bonus: 200, nextMilestone: { days: 14, xp: 300 } })
  })

  it('shows what today paid once it counted', () => {
    const v = dayStreak({ ...s, current: 3, lastDate: '2026-10-21' }, '2026-10-21', ['2026-10-21'], [])
    expect(v).toMatchObject({ current: 3, playedToday: true, bonus: 120 })
    expect(v.days.at(-1)).toEqual({ date: '2026-10-21', state: 'played' })
  })

  it('shows a lost streak as 0, its bonus back at 100', () => {
    expect(dayStreak(s, '2026-10-25', [], [])).toMatchObject({ current: 0, bonus: 100, nextMilestone: { days: 7 } })
  })
})
