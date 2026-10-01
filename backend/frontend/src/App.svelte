<script lang="ts">
  import Router, { push } from 'svelte-spa-router'
  import { onMount } from 'svelte'
  import { Tooltip } from 'bits-ui'
  import CreateSession from './routes/CreateSession.svelte'
  import GameDisplay from './routes/GameDisplay.svelte'
  import Login from './routes/Login.svelte'
  import Register from './routes/Register.svelte'
  import Boards from './routes/Boards.svelte'
  import History from './routes/History.svelte'
  import { authClient } from '$lib/auth'

  const routes = {
    '/': CreateSession,
    '/session/:id': GameDisplay,
    '/login': Login,
    '/register': Register,
    '/boards': Boards,
    '/history': History,
  }

  let checked = false

  onMount(async () => {
    const currentHash = window.location.hash
    if (currentHash.startsWith('#/login')) { checked = true; return }
    try {
      const { data } = await authClient.getSession()
      if (!data?.user) void push('/login')
    } catch {
      void push('/login')
    }
    checked = true
  })
</script>

<Tooltip.Provider>
  {#if checked}
    <Router {routes} />
  {/if}
</Tooltip.Provider>
