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
  import Lobby from './routes/Lobby.svelte'
  import Join from './routes/Join.svelte'
  import Invites from './routes/Invites.svelte'
  import { get } from 'svelte/store'
  import { currentUser } from '$lib/auth'
  import { me } from '$lib/lobby/sockets'
  import { rememberReturn, sessionStore } from '$lib/returnTo'

  const routes = {
    '/': CreateSession,
    '/session/:id': GameDisplay,
    '/login': Login,
    '/register': Register,
    '/boards': Boards,
    '/history': History,
    '/lobby': Lobby,
    '/join': Join,
    '/join/:code': Join,
    '/invites': Invites,
  }

  let checked = $state(false)

  onMount(async () => {
    const currentHash = window.location.hash
    if (currentHash.startsWith('#/login') || currentHash.startsWith('#/register')) { checked = true; return }
    await currentUser.refresh()
    if (!get(currentUser)) {
      // A join link or QR code opened while signed out comes back here after signing in
      rememberReturn(sessionStore(), currentHash)
      void push('/login')
    }
    checked = true
  })

  // The per-user socket (invites, the lobby indicator) runs while someone is signed in, and
  // restarts when the signed-in user changes (dev user switch, signing in as someone else) so
  // the new user doesn't see the previous one's invites and lobby. The same user signing back
  // in after the server closed it (4401) starts it again.
  let meUserId: string | null = null
  $effect(() => {
    const id = $currentUser?.id ?? null
    if (id === meUserId && (id === null || me.running())) return
    me.stop()
    meUserId = id
    if (id) me.start()
  })
</script>

<Tooltip.Provider>
  {#if checked}
    <Router {routes} />
  {/if}
</Tooltip.Provider>
