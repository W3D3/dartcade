// The server half of the Friends search: what "People on Dartcade" shows while someone types.
// Debounced, and an answer that arrives after a newer search started is dropped, so a slow
// response can never replace the list for what is typed now.
import type { FriendSearchHit } from '$lib/api'
import { loadSuggestions, searchPeople } from './actions'
import { parseFriendName, SEARCH_MIN } from './view'

/** idle: nothing typed; short: 1 to 2 characters; loading: asked, no answer yet; limited: too many searches. */
export type PeoplePhase = 'idle' | 'short' | 'loading' | 'ready' | 'error' | 'limited'

export function createPeopleSearch(delayMs = 250) {
  let phase = $state<PeoplePhase>('idle')
  let people = $state<FriendSearchHit[]>([])
  let suggestions = $state<FriendSearchHit[]>([])
  // What the user just did to a person, shown until the next search answer counts it (not a suggestions answer: it may be older than the click)
  let marks = $state<Record<string, FriendSearchHit['request']>>({})
  let timer: ReturnType<typeof setTimeout> | undefined
  let latest = 0

  /** Looks for `raw` once typing pauses; the list in view stays until the answer replaces it, so rows don't jump. */
  function search(raw: string): void {
    clearTimeout(timer)
    const mine = ++latest
    const q = parseFriendName(raw)
    if (q === '' || Array.from(q).length < SEARCH_MIN) {
      phase = q === '' ? 'idle' : 'short'
      people = []
      return
    }
    phase = 'loading'
    timer = setTimeout(() => {
      void searchPeople(q).then(r => {
        if (mine !== latest) return
        if ('error' in r) {
          people = []
          phase = r.error === 'rate' ? 'limited' : 'error'
        } else {
          people = r.users
          marks = {}
          phase = 'ready'
        }
      })
    }, delayMs)
  }

  /** People you may know, asked when the field is open and empty; a failure just shows none. */
  async function suggest(): Promise<void> {
    const r = await loadSuggestions()
    suggestions = 'users' in r ? r.users : []
  }

  return {
    get phase() {
      return phase
    },
    get people() {
      return people
    },
    get suggestions() {
      return suggestions
    },
    /** Where a person stands: what the user just did, else what the server said. */
    stateOf: (p: FriendSearchHit) => marks[p.id] ?? p.request,
    mark(id: string, request: FriendSearchHit['request']) {
      marks[id] = request
    },
    search,
    suggest,
  }
}
