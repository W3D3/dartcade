// Segment items: placed on a number for the rest of the run, they fire for every hero who hits it.
import type { ContentEntry } from './types.js'

export const SEGMENT_ITEMS = {
  whetstoneRune: {
    name: 'Whetstone Rune',
    rarity: 'common',
    status: 'draft',
    description: 'Hits here deal +10 damage.',
    trigger: 'On each dart',
    hooks: { onDart: () => [{ effect: 'base_add', value: 10 }] },
  },
  stoneWall: {
    name: 'Stone Wall',
    rarity: 'common',
    status: 'draft',
    description: 'Hitting it gives 10 block.',
    trigger: 'On each dart',
    hooks: { onDart: () => [{ effect: 'block', value: 10 }] },
  },
} as const satisfies Record<string, ContentEntry>

export type SegmentItemId = keyof typeof SEGMENT_ITEMS
export const isSegmentItemId = (id: string): id is SegmentItemId => Object.hasOwn(SEGMENT_ITEMS, id)
export const SEGMENT_ITEM_IDS: SegmentItemId[] = Object.keys(SEGMENT_ITEMS).filter(isSegmentItemId)
