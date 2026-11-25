<script lang="ts">
  // An old page's address (#/history, #/matchmaking, ...): replaced by where it lives now, query kept, so Back skips it.
  import { onMount } from 'svelte'
  import { location, querystring, replace } from 'svelte-spa-router'
  import { get } from 'svelte/store'
  import { movedTo } from '$lib/routes'

  onMount(() => {
    const qs = get(querystring)
    void replace((movedTo(get(location)) ?? '/') + (qs ? `?${qs}` : ''))
  })
</script>
