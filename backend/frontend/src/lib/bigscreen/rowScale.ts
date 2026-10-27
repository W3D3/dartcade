// Sizes (px) of a seat row on the big screen, shrunk as seats are added so the rows fit the stage.
export type RowScale = {
  avatar: number
  name: number
  num: number
  strip: number
  detail: number
  /** Higher Lower: the last visit's total, and its effect and the lives text. */
  lastNum: number
  effect: number
  /** Hearts are sized by a class, so one of two. */
  heartClass: 'size-[36px]' | 'size-[24px]'
}

const BASE = { avatar: 56, name: 40, num: 84, strip: 34, detail: 28, lastNum: 56, effect: 26 }

/** The pill a seat wears: out beats throwing beats next; none otherwise. */
export const pillKind = (s: { throwing: boolean; next: boolean; out?: boolean }): 'throwing' | 'next' | 'out' | null =>
  s.out ? 'out' : s.throwing ? 'throwing' : s.next ? 'next' : null

/** From three seats on, the big screen lists the seats as rows instead of cards. */
export const isParty = (seats: number): boolean => seats > 2

/** Full size up to four seats, 80% at five, 65% from six. */
export function rowScale(seats: number): RowScale {
  const f = seats <= 4 ? 1 : seats === 5 ? 0.8 : 0.65
  const r = (n: number) => Math.round(n * f)
  return {
    avatar: r(BASE.avatar),
    name: r(BASE.name),
    num: r(BASE.num),
    strip: r(BASE.strip),
    detail: r(BASE.detail),
    lastNum: r(BASE.lastNum),
    effect: r(BASE.effect),
    heartClass: seats <= 4 ? 'size-[36px]' : 'size-[24px]',
  }
}
