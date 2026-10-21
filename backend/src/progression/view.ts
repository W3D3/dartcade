// The day streak as GET /api/progress/me shows it: pure, from the stored streak and the days played.
import { addDays, dailyBonus, nextMilestone, streakNow, type StreakState } from '../shared/progression.js'
import type { components } from '../schema/api.js'

type DayStreak = components['schemas']['DayStreak']

export function dayStreak(s: StreakState, today: string, played: readonly string[], frozen: readonly string[]): DayStreak {
  const current = streakNow(s, today)
  const playedToday = s.lastDate === today
  const days = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(today, i - 6)
    const state: DayStreak['days'][number]['state'] = played.includes(date)
      ? 'played'
      : frozen.includes(date)
        ? 'frozen'
        : date === today
          ? 'today'
          : 'missed'
    return { date, state }
  })
  return {
    current,
    best: s.best,
    freezes: s.freezes,
    playedToday,
    // Today's game is streak day current + 1, unless it already counted
    bonus: dailyBonus(playedToday ? current : current + 1),
    today,
    days,
    nextMilestone: nextMilestone(current),
  }
}
