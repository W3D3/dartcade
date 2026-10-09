<script lang="ts">
  import Router, { push, location } from 'svelte-spa-router'
  import wrap from 'svelte-spa-router/wrap'
  import { onMount } from 'svelte'
  import { Tooltip } from 'bits-ui'
  import CreateSession from './routes/CreateSession.svelte'
  import GameDisplay from './routes/GameDisplay.svelte'
  import Login from './routes/Login.svelte'
  import Register from './routes/Register.svelte'
  import Boards from './routes/Boards.svelte'
  import History from './routes/History.svelte'
  import RouteLoading from './routes/RouteLoading.svelte'
  import RouteLoadFailed from './routes/RouteLoadFailed.svelte'
  import Lobby from './routes/Lobby.svelte'
  import Join from './routes/Join.svelte'
  import Invites from './routes/Invites.svelte'
  import Settings from './routes/Settings.svelte'
  import Friends from './routes/Friends.svelte'
  import PickName from './routes/PickName.svelte'
  import { get } from 'svelte/store'
  import { currentUser } from '$lib/auth'
  import { me } from '$lib/lobby/sockets'
  import { rememberReturn, sessionStore } from '$lib/returnTo'

  // Match details pulls in LayerChart for its two charts; load it only when someone opens it.
  // `RouteLoadFailed` is a static import (not another dynamic one) so a failed chunk fetch —
  // offline, or a stale tab after a deploy whose hashed chunk is gone — can't fail the same way
  // and leave a blank page; it resolves synchronously in the `.catch`. `RouteLoading` is attached
  // the same way `wrap()`'s own (unused here) `loadingComponent` option would, via `Object.assign`
  // rather than passing it through `wrap()` directly — svelte-spa-router 4.x's bundled types
  // predate Svelte 5 and reject a Svelte 5 component there even though the identical component
  // works fine as a plain route value a few lines below.
  const loadGameDetails = Object.assign(() => import('./routes/GameDetails.svelte').catch(() => ({ default: RouteLoadFailed })), {
    loading: RouteLoading,
  })
  // The minigolf bench brings the physics engine (nape-js): only admins open it, so it loads on demand too
  const loadMinigolfBench = Object.assign(() => import('./routes/MinigolfBench.svelte').catch(() => ({ default: RouteLoadFailed })), {
    loading: RouteLoading,
  })

  const routes = {
    '/': CreateSession,
    '/session/:id': GameDisplay,
    '/login': Login,
    '/register': Register,
    '/boards': Boards,
    '/history/:id': wrap({ asyncComponent: loadGameDetails }),
    '/history': History,
    '/lobby': Lobby,
    '/join': Join,
    '/join/:code': Join,
    '/invites': Invites,
    '/settings': Settings,
    '/friends': Friends,
    '/admin/minigolf': wrap({ asyncComponent: loadMinigolfBench }),
  }

  let checked = $state(false)

  onMount(async () => {
    const currentHash = window.location.hash
    if (currentHash.startsWith('#/login') || currentHash.startsWith('#/register')) {
      checked = true
      return
    }
    await currentUser.refresh()
    if (!get(currentUser)) {
      // A join link or QR code opened while signed out comes back here after signing in
      rememberReturn(sessionStore(), currentHash)
      void push('/login')
    }
    checked = true
  })

  // Every 401 handler (API, sockets, voice import) sends the user to the login page by setting
  // the hash only, so whoever was signed in stays in the store. Nobody is signed in on the
  // login page: drop the stale user so it can't leak into things like the dev user switch.
  $effect(() => {
    if ($location.startsWith('/login')) currentUser.set(null)
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
    {#if $currentUser?.nameNeedsChange}
      <PickName />
    {:else}
      <Router {routes} />
    {/if}
  {/if}
</Tooltip.Provider>
