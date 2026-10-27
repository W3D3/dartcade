<script lang="ts">
  // What the root route shows: Home. While an admin has turned home.enabled off, Play is all there is,
  // at /play. On until the flags say otherwise, so signing in does not bounce off the Play page first.
  import { replace } from 'svelte-spa-router'
  import Home from './Home.svelte'
  import { flag } from '$lib/flags'

  const home = flag('home.enabled', true)
  $effect(() => {
    if (!$home) void replace('/play')
  })
</script>

{#if $home}<Home />{/if}
