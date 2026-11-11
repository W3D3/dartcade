<script lang="ts">
  import { hrefs } from '$lib/routes'
  import { PLAYER_AREA } from '$lib/minigolf/editor/area'
  import { deviceStore } from '$lib/storage'
  import Router, { push, location } from 'svelte-spa-router'
  import wrap from 'svelte-spa-router/wrap'
  import { onMount } from 'svelte'
  import { Tooltip } from 'bits-ui'
  import CreateSession from './routes/CreateSession.svelte'
  import Root from './routes/Root.svelte'
  import GameDisplay from './routes/GameDisplay.svelte'
  import Login from './routes/Login.svelte'
  import Register from './routes/Register.svelte'
  import Verify from './routes/Verify.svelte'
  import Forgot from './routes/Forgot.svelte'
  import Reset from './routes/Reset.svelte'
  import Legal from './routes/Legal.svelte'
  import BoardsRedirect from './routes/BoardsRedirect.svelte'
  import History from './routes/History.svelte'
  import RouteLoading from './routes/RouteLoading.svelte'
  import CoachLoading from './routes/CoachLoading.svelte'
  import RouteLoadFailed from './routes/RouteLoadFailed.svelte'
  import Lobby from './routes/Lobby.svelte'
  import Join from './routes/Join.svelte'
  import Invites from './routes/Invites.svelte'
  import Settings from './routes/Settings.svelte'
  import Friends from './routes/Friends.svelte'
  import VoicePackDetails from './routes/VoicePackDetails.svelte'
  import PickName from './routes/PickName.svelte'
  import Matchmaking from './routes/Matchmaking.svelte'
  import Ranks from './routes/Ranks.svelte'
  import Progress from './routes/Progress.svelte'
  import Profile from './routes/Profile.svelte'
  import Achievements from './routes/Achievements.svelte'
  import Customise from './routes/Customise.svelte'
  import Rewards from './routes/Rewards.svelte'
  import Admin from './routes/Admin.svelte'
  import BigScreen from './routes/BigScreen.svelte'
  import Watch from './routes/Watch.svelte'
  import BigScreenFrame from './routes/BigScreenFrame.svelte'
  import AdminUsers from './routes/AdminUsers.svelte'
  import AdminGames from './routes/AdminGames.svelte'
  import ImpersonationBanner from '$lib/components/admin/ImpersonationBanner.svelte'
  import FinishSprite from '$lib/components/FinishSprite.svelte'
  import BadgeDefs from '$lib/components/achievements/BadgeDefs.svelte'
  import AchievementToasts from '$lib/components/achievements/AchievementToasts.svelte'
  import AdminFlags from './routes/AdminFlags.svelte'
  import AdminRanked from './routes/AdminRanked.svelte'
  import AdminMinigolfReports from './routes/AdminMinigolfReports.svelte'
  import MinigolfBrowse from './routes/MinigolfBrowse.svelte'
  import AdminSystem from './routes/AdminSystem.svelte'
  import AdminDartSamples from './routes/AdminDartSamples.svelte'
  import AdminCosmetics from './routes/AdminCosmetics.svelte'
  import MatchFound from '$lib/components/ranked/MatchFound.svelte'
  import { get } from 'svelte/store'
  import { currentUser } from '$lib/auth'
  import { loadAccountSettings } from '$lib/accountSettings'
  import { syncTimeZone } from '$lib/progress/timeZone'
  import ProgressToasts from '$lib/components/progress/ProgressToasts.svelte'
  import { setFlagUser, startFlags } from '$lib/flags'
  import { gameModes } from '$lib/gameModes'
  import { me } from '$lib/lobby/sockets'
  import { rememberReturn, sessionStore } from '$lib/returnTo'
  import { isPublicRoute } from '$lib/publicRoutes'
  import { authRedirect } from '$lib/authRedirect'

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
  // The minigolf bench brings the hole tools and physics: only admins open it, so it loads on demand too
  const loadMinigolfBench = Object.assign(() => import('./routes/MinigolfBench.svelte').catch(() => ({ default: RouteLoadFailed })), {
    loading: RouteLoading,
  })
  // One lazy component for every course editor route (admin and player), so picking another course keeps the page (and its lists)
  const loadMinigolfCourses = Object.assign(() => import('./routes/MinigolfCourses.svelte').catch(() => ({ default: RouteLoadFailed })), {
    loading: RouteLoading,
  })
  const minigolfCourses = wrap({ asyncComponent: loadMinigolfCourses })
  // The same editor for players, outside #/admin (the pages check the flag)
  const playerMinigolfCourses = wrap({ asyncComponent: loadMinigolfCourses, props: { area: PLAYER_AREA } })
  // The coach pages load on demand: they're behind a flag and bring the coach's own code. Each shows
  // its own skeleton meanwhile (`loadingParams` is wrap()'s, passed to it as `params`)
  const loadCoach = Object.assign(() => import('./routes/Coach.svelte').catch(() => ({ default: RouteLoadFailed })), {
    loading: CoachLoading,
    loadingParams: { page: 'list' },
  })
  const loadCoachChecks = Object.assign(() => import('./routes/CoachChecks.svelte').catch(() => ({ default: RouteLoadFailed })), {
    loading: CoachLoading,
    loadingParams: { page: 'checks' },
  })
  const loadCoachLeg = Object.assign(() => import('./routes/CoachLeg.svelte').catch(() => ({ default: RouteLoadFailed })), {
    loading: CoachLoading,
    loadingParams: { page: 'leg' },
  })
  // The admin sandbox runs the coach's checkout model in the browser
  const loadAdminCoach = Object.assign(() => import('./routes/AdminCoach.svelte').catch(() => ({ default: RouteLoadFailed })), {
    loading: CoachLoading,
    loadingParams: { page: 'sandbox' },
  })
  // The stats components' showcase: only on the dev server, so a build leaves it (and its fixtures) out
  const devRoutes = import.meta.env.DEV
    ? {
        '/dev/stats': wrap({
          asyncComponent: () => import('./routes/DevStatsShowcase.svelte').catch(() => ({ default: RouteLoadFailed })),
        }),
      }
    : {}
  // Stats loads on demand: it is behind a flag and brings the charts
  const loadStats = Object.assign(() => import('./routes/Stats.svelte').catch(() => ({ default: RouteLoadFailed })), {
    loading: RouteLoading,
  })
  const loadMinigolfHoleEditor = Object.assign(
    () => import('./routes/MinigolfHoleEditor.svelte').catch(() => ({ default: RouteLoadFailed })),
    { loading: RouteLoading },
  )

  const routes = {
    '/': Root,
    '/play': CreateSession,
    '/session/:id': GameDisplay,
    '/watch/:id': Watch,
    '/login': Login,
    '/register': Register,
    '/verify': Verify,
    '/forgot': Forgot,
    '/reset': Reset,
    '/terms': Legal,
    '/privacy': Legal,
    '/imprint': Legal,
    // Boards moved into Settings; old links (and ?pair) still land there
    '/boards': BoardsRedirect,
    '/history/:id': wrap({ asyncComponent: loadGameDetails }),
    '/history': History,
    '/stats': wrap({ asyncComponent: loadStats }),
    '/coach': wrap({ asyncComponent: loadCoach }),
    '/coach/checks': wrap({ asyncComponent: loadCoachChecks }),
    '/coach/leg/:gameId/:leg': wrap({ asyncComponent: loadCoachLeg }),
    '/lobby': Lobby,
    '/join': Join,
    '/join/:code': Join,
    '/invites': Invites,
    '/settings': Settings,
    '/settings/:section': Settings,
    '/voice-packs/:id': VoicePackDetails,
    '/friends': Friends,
    '/matchmaking': Matchmaking,
    '/matchmaking/ranks': Ranks,
    '/progress': Progress,
    '/progress/rewards': Rewards,
    '/progress/achievements': Achievements,
    '/progress/rewards/:level': Rewards,
    '/profile': Profile,
    // Before /profile/:id; one route (tab optional) so switching tabs keeps the page and its draft
    '/profile/customise/:tab?': Customise,
    '/profile/:id': Profile,
    '/big-screen/:board': BigScreen,
    '/big-screen-frame': BigScreenFrame,
    '/admin': Admin,
    '/admin/users': AdminUsers,
    '/admin/games': AdminGames,
    '/admin/games/:id': wrap({ asyncComponent: loadGameDetails, props: { admin: true } }),
    '/admin/flags': AdminFlags,
    '/admin/ranked': AdminRanked,
    '/admin/minigolf/reports': AdminMinigolfReports,
    '/minigolf/browse': MinigolfBrowse,
    '/admin/system': AdminSystem,
    '/admin/dart-samples': AdminDartSamples,
    '/admin/cosmetics': AdminCosmetics,
    '/admin/coach': wrap({ asyncComponent: loadAdminCoach }),
    '/admin/minigolf': wrap({ asyncComponent: loadMinigolfBench }),
    '/admin/minigolf/courses': minigolfCourses,
    '/admin/minigolf/courses/:id': minigolfCourses,
    '/admin/minigolf/holes/:id': wrap({ asyncComponent: loadMinigolfHoleEditor }),
    '/minigolf/courses': playerMinigolfCourses,
    '/minigolf/courses/:id': playerMinigolfCourses,
    '/minigolf/holes/:id': wrap({ asyncComponent: loadMinigolfHoleEditor, props: { area: PLAYER_AREA } }),
    ...devRoutes,
  }

  let checked = $state(false)

  onMount(async () => {
    // better-auth's verify-email callback can land a failed link here with ?error=… before the
    // hash, aimed at whatever page verification was going to continue to, not at #/verify itself.
    const redirect = authRedirect(window.location.search, window.location.hash)
    if (redirect.stripQuery) {
      void push(redirect.hash.slice(1))
      history.replaceState(null, '', window.location.pathname + window.location.hash)
    }
    const currentHash = redirect.hash
    if (isPublicRoute(currentHash)) {
      void startFlags(null)
      checked = true
      return
    }
    await currentUser.refresh()
    void startFlags(get(currentUser)?.id ?? null)
    // A kiosk has no session and never goes to the login page; opened from the app it keeps the signed-in user
    if (currentHash.startsWith(hrefs.bigScreen('')) || currentHash.startsWith(hrefs.bigScreenFrame())) {
      checked = true
      return
    }
    // A join link or QR code opened while signed out shows its lobby first (and comes back after
    // signing in); everything else goes to the login page and comes back here after it
    if (!get(currentUser) && !currentHash.startsWith(hrefs.join() + '/')) {
      rememberReturn(sessionStore(), currentHash)
      void push('/login')
    }
    checked = true
  })

  // Flags follow the signed-in user (sign-in, sign-out, the dev user switch): the provider refetches
  let flagUser: string | null | undefined
  $effect(() => {
    const id = $currentUser?.id ?? null
    // The game modes on offer depend on the user's flags too
    if (flagUser !== undefined && id !== flagUser) {
      void setFlagUser(id)
      void gameModes.refresh()
    }
    flagUser = id
  })

  // Every 401 handler (API, sockets, voice import) sends the user to the login page by setting
  // the hash only, so whoever was signed in stays in the store. Nobody is signed in on the
  // login page: drop the stale user so it can't leak into things like the dev user switch.
  $effect(() => {
    if ($location.startsWith('/login')) currentUser.set(null)
  })

  // The big screen page and its frame (a kiosk, or the owner's preview) need none of the app's extras: the
  // per-user socket, the name prompt, the banner; the frame not even the account's settings (the page has them)
  const bigScreen = $derived($location.startsWith('/big-screen'))
  const bigScreenFrame = $derived($location.startsWith('/big-screen-frame'))

  // Account-wide settings follow the signed-in user (sign-in, sign-out, a switch of user)
  let settingsUser: string | null | undefined
  $effect(() => {
    const id = $currentUser?.id ?? null
    if (bigScreenFrame || id === settingsUser) return
    settingsUser = id
    void loadAccountSettings(id, deviceStore())
    if (id) void syncTimeZone()
  })

  // The per-user socket (invites, the lobby indicator) runs while someone is signed in, and
  // restarts when the signed-in user changes (dev user switch, signing in as someone else) so
  // the new user doesn't see the previous one's invites and lobby. The same user signing back
  // in after the server closed it (4401) starts it again.
  let meUserId: string | null = null
  $effect(() => {
    const id = $currentUser?.id ?? null
    if (bigScreen) return
    if (id === meUserId && (id === null || me.running())) return
    me.stop()
    meUserId = id
    if (id) me.start()
  })
</script>

<FinishSprite />
<BadgeDefs />
<Tooltip.Provider>
  {#if checked}
    {#if $currentUser?.nameNeedsChange && !bigScreen}
      <PickName />
    {:else}
      <Router {routes} />
      {#if $currentUser && !bigScreen}<ProgressToasts /><AchievementToasts /><MatchFound />{/if}
    {/if}
  {/if}
  {#if $currentUser?.impersonating && !bigScreen}<ImpersonationBanner name={$currentUser.name} />{/if}
</Tooltip.Provider>
