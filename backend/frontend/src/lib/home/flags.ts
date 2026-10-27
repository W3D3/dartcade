// The flags Home's banners and news items can depend on (see featured.ts, news.ts), as one
// "is this flag on for me" lookup that updates as the flags load. A key no item names is off.
import { derived } from 'svelte/store'
import { flag } from '$lib/flags'
import { FEATURED } from './featured'
import { NEWS } from './news'

const KEYS = [...new Set([...FEATURED, ...NEWS].flatMap(item => (item.flag ? [item.flag] : [])))]

export const homeFlagOn = derived(
  KEYS.map(key => flag(key)),
  values =>
    (key: string): boolean =>
      values[KEYS.indexOf(key)] ?? false,
)
