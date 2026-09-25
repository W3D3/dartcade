<script lang="ts">
  import Router, { push } from 'svelte-spa-router'
  import { onMount } from 'svelte'
  import CreateSession from './routes/CreateSession.svelte'
  import GameDisplay from './routes/GameDisplay.svelte'
  import Login from './routes/Login.svelte'
  import Boards from './routes/Boards.svelte'

  const routes = {
    '/': CreateSession,
    '/session/:id': GameDisplay,
    '/login': Login,
    '/boards': Boards,
  }

  let checked = false

  onMount(async () => {
    const currentHash = window.location.hash
    if (currentHash.startsWith('#/login')) { checked = true; return }
    try {
      const res = await fetch('/api/auth/get-session')
      if (!res.ok || !(await res.json())?.user) push('/login')
    } catch {
      push('/login')
    }
    checked = true
  })
</script>

{#if checked}
  <Router {routes} />
{/if}
