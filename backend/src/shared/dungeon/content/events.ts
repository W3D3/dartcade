// Event rooms: a text and 2 to 4 decisions the party votes on. No event is designed yet; these are
// placeholders (named so) that use only outcomes the game already has.
import type { SegmentItemId } from './segmentItems.js'

/** What a decision does. `hp` heals (or, negative, hurts but never downs) every living hero; `artifact` gives each living hero a random one; `item` places one on a random number. */
export type Outcome =
  | { kind: 'gold'; value: number }
  | { kind: 'hp'; value: number }
  | { kind: 'artifact' }
  | { kind: 'item'; item: SegmentItemId }

export type Decision = { label: string; outcomes: Outcome[] }

export type EventEntry = { title: string; text: string; decisions: [Decision, Decision, ...Decision[]] }

export const EVENTS = {
  placeholderShrine: {
    title: 'Placeholder: Cracked Shrine',
    text: 'A cracked shrine hums in the dark. A gem glows in its base.',
    decisions: [
      { label: 'Pray (heal 15)', outcomes: [{ kind: 'hp', value: 15 }] },
      {
        label: 'Pry out the gem (+25 gold, -8 HP)',
        outcomes: [
          { kind: 'gold', value: 25 },
          { kind: 'hp', value: -8 },
        ],
      },
      { label: 'Walk on', outcomes: [] },
    ],
  },
  placeholderForge: {
    title: 'Placeholder: Abandoned Forge',
    text: 'An abandoned forge, still warm. Two tools lie on the anvil.',
    decisions: [
      { label: 'Take the Whetstone Rune', outcomes: [{ kind: 'item', item: 'whetstoneRune' }] },
      { label: 'Take the Stone Wall', outcomes: [{ kind: 'item', item: 'stoneWall' }] },
    ],
  },
} as const satisfies Record<string, EventEntry>

export type EventId = keyof typeof EVENTS
export const isEventId = (id: string): id is EventId => Object.hasOwn(EVENTS, id)
export const EVENT_IDS: EventId[] = Object.keys(EVENTS).filter(isEventId)
