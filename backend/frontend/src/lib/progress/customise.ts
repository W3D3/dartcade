// The Customise page (`#/profile/customise/:tab`, Profile-Customise boards): its tabs, and the
// draft you edit there before Save (your equipped look and the two layers of your picture).
import { EQUIP_KINDS, type Equipped, type PerkKind } from '$shared/progression.js'

export const TABS = ['picture', 'frame', 'banner', 'colours', 'title', 'sounds', 'celebrations'] as const
export type Tab = (typeof TABS)[number]

/** The tab a route param names; Picture for none (or an unknown one). */
export const tabOf = (param: string | undefined): Tab => TABS.find(t => t === param) ?? 'picture'

/** Each tab's label, its grid's subtitle and the hint under your card. */
export const TAB_META: Record<Tab, { label: string; sub: string; hint: string }> = {
  picture: {
    label: 'Picture',
    sub: '',
    hint: 'Start with the nine basics, then mix in any finish you unlock. The card shows the combination.',
  },
  frame: {
    label: 'Frame',
    sub: 'the ring around your picture',
    hint: 'Frames come from the level track every 10 levels. The Legend frame turns slowly; everything else is still.',
  },
  banner: {
    label: 'Banner',
    sub: 'the strip at the top of your card',
    hint: 'Banners pick up your colour, so the same banner looks different in Ember or Ice. Cork board and the gold banners keep their own colours.',
  },
  colours: {
    label: 'Colours',
    sub: 'your name and banner tint',
    hint: 'Your colour tints your name and your banner. Pictures keep their own colours.',
  },
  title: {
    label: 'Title',
    sub: 'shown under your name',
    hint: 'A new title every few levels, plus a few from streaks and challenges. Shown under your name everywhere.',
  },
  sounds: {
    label: 'Sounds',
    sub: 'what your darts sound like',
    hint: 'The sound pack your darts make on the match screen. Picking one plays a sample.',
  },
  celebrations: {
    label: 'Celebrations',
    sub: 'what your wins get',
    hint: 'What plays when you win. Picking one plays it over your card.',
  },
}

/** The perk kind a tab picks (Colours also has the name style; Picture is the avatar's layers). */
export const TAB_KIND: Record<Exclude<Tab, 'picture'>, PerkKind> = {
  frame: 'frame',
  banner: 'banner',
  colours: 'colors',
  title: 'title',
  sounds: 'sound',
  celebrations: 'celebration',
}

/** The two layers of a built-in picture. Null: not a built-in one (an uploaded photo, none). */
export type Layers = { foreground: string; background: string } | null

/** The kinds the draft changed, to send to PUT /api/progress/equip; empty when none did. */
export function equipChanges(saved: Equipped, draft: Equipped): Partial<Equipped> {
  return Object.fromEntries(EQUIP_KINDS.filter(k => draft[k] !== saved[k]).map(k => [k, draft[k]]))
}

/** Whether the draft's picture differs from the one you wear (a built-in one, or a photo: null). */
export const pictureChanged = (saved: Layers, draft: Layers): boolean =>
  draft !== null && (saved === null || saved.foreground !== draft.foreground || saved.background !== draft.background)

/** The options a grid shows: the unlocked ones first, then the locked ones unless Hide locked is on. */
export const gridItems = <T extends { open: boolean }>(items: T[], hideLocked: boolean): T[] =>
  hideLocked ? items.filter(i => i.open) : [...items.filter(i => i.open), ...items.filter(i => !i.open)]

/** "N of M unlocked", leaving out the "nothing" options (No frame, No sounds) as the boards do. */
export function unlockedCount(items: { id: string; open: boolean }[]): string {
  const real = items.filter(i => !i.id.endsWith('.none'))
  return `${real.filter(i => i.open).length} of ${real.length} unlocked`
}

const HIDE_KEY = 'dartcade.customise.hideLocked'
/** Hide locked, kept across tabs and visits on this device; off without storage. */
export function loadHideLocked(): boolean {
  try {
    return localStorage.getItem(HIDE_KEY) === '1'
  } catch {
    return false
  }
}
export function saveHideLocked(on: boolean): void {
  try {
    localStorage.setItem(HIDE_KEY, on ? '1' : '0')
  } catch {
    // No storage (private mode): it lasts the visit
  }
}
