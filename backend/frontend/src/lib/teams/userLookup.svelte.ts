// The account with exactly the name typed in a people picker (GET /api/users), looked up once the
// typing pauses. Call it while a component initialises: it holds an effect.
import { api } from '$lib/api'
import { debounced, SEARCH_DEBOUNCE_MS } from '$lib/utils'

/** The accounts named exactly `query()` (at least two letters); empty until the lookup answers. */
export function createUserLookup(query: () => string): { readonly found: { id: string; name: string }[] } {
  let found = $state<{ id: string; name: string }[]>([])
  const lookup = debounced(() => {
    const q = query()
    void api
      .GET('/api/users', { params: { query: { q } } })
      .then(({ data }) => {
        if (q === query()) found = data?.users ?? []
      })
      .catch(() => {})
  }, SEARCH_DEBOUNCE_MS)
  $effect(() => {
    found = []
    if (query().length >= 2) lookup.call()
    else lookup.cancel()
  })
  return {
    get found() {
      return found
    },
  }
}
