// A list's drag and arrow-key moves (the people list, the Teams panel, a course's holes): shows
// the new order until the server answers, sends the move, and words it for the screen reader.
// The server decides: the next snapshot replaces the shown order, and a refused move snaps back
// (the lobby page shows the refusal like any other).
import type { TeamId } from '../api/lobby-ws'
import { placed, samePlace, type Placement } from './dnd'

export function createReorder<T extends { id: string; name: string; team?: TeamId | null }>(
  /** The items as the server last sent them. */
  source: () => T[],
  send: (personId: string, placement: Placement) => Promise<boolean>,
) {
  let preview = $state.raw<T[] | null>(null)
  let announcement = $state('')
  // A new snapshot always wins over what was shown
  $effect.pre(() => {
    source()
    preview = null
  })

  return {
    get people(): T[] {
      return preview ?? source()
    },
    get announcement(): string {
      return announcement
    },
    /** Moves someone; `say` words where they ended up, from the new order. */
    async place(personId: string, placement: Placement, say: (people: T[], person: T) => string): Promise<void> {
      const now = preview ?? source()
      const person = now.find(p => p.id === personId)
      if (!person || samePlace(now, personId, placement)) return
      const next = placed(now, personId, placement)
      const moved = next.find(p => p.id === personId) ?? person
      preview = next
      announcement = say(next, moved)
      if (!(await send(personId, placement))) {
        preview = null
        announcement = `Couldn't move ${person.name}.`
      }
    },
    cancelled(): void {
      announcement = 'Move cancelled.'
    },
  }
}
