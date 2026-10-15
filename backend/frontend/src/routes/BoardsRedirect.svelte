<script lang="ts">
  // The old `#/boards` page: Boards is a Settings section now. Replaces the entry so Back skips it.
  import { onMount } from 'svelte'
  import { querystring, replace } from 'svelte-spa-router'
  import { get } from 'svelte/store'
  import { boardsRedirect } from '$lib/settings/sections'

  onMount(() => {
    void replace(boardsRedirect(get(querystring)))
  })
</script>
