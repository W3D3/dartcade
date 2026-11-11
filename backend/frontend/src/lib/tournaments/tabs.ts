// The Tournaments page's tabs (`#/tournaments/:tab`, Tournaments and Tournaments-Phone boards).

export const TOURNAMENT_TABS = ['browse', 'mine', 'teams'] as const
export type TournamentsTab = (typeof TOURNAMENT_TABS)[number]

/** Each tab's label on a desktop, and the shorter one in the phone's segmented control. */
export const TAB_LABELS: Record<TournamentsTab, { label: string; short: string }> = {
  browse: { label: 'Browse', short: 'Browse' },
  mine: { label: 'My tournaments', short: 'Mine' },
  teams: { label: 'Teams', short: 'Teams' },
}

/** The tab a route param names; Browse for none (or an unknown one). */
export const tabOf = (param: string | undefined): TournamentsTab => TOURNAMENT_TABS.find(t => t === param) ?? 'browse'
