<script lang="ts">
  import Router from 'svelte-spa-router'
  import CreateSession from './routes/CreateSession.svelte'
  import GameDisplay from './routes/GameDisplay.svelte'

  const routes = {
    '/': CreateSession,
    '/session/:id': GameDisplay,
  }
</script>

<Router {routes} />
