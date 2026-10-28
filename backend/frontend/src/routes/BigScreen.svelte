<script lang="ts">
  // The big screen: a view-only page a TV or kiosk opens at #/big-screen/<board>?k=<token>.
  // The board's socket says what to show (idle, the live game, the held result).
  import { onDestroy, onMount, untrack } from 'svelte'
  import { hideCursor } from '$lib/bigscreen/hideCursor'
  import { currentUser } from '$lib/auth'
  import { accountSettings } from '$lib/accountSettings'
  import { loadSettings } from '$lib/gameSettings'
  import { createBigScreenAudio, createSettingsMemo, kioskSettings } from '$lib/bigscreen/audio'
  import { createBigScreenStore } from '$lib/bigscreen/store'
  import { gameState } from '$lib/gameState'
  import { emptyHistory, trackVisits, type VisitHistory } from '$lib/visitHistory'
  import type { Snapshot } from '$lib/ws'
  import Stage from '$lib/components/bigscreen/Stage.svelte'
  import Idle from '$lib/components/bigscreen/Idle.svelte'
  import Reconnecting from '$lib/components/bigscreen/Reconnecting.svelte'
  import MatchFrame from '$lib/components/bigscreen/MatchFrame.svelte'

  let { params }: { params: { board: string } } = $props()

  // The board of the route is fixed for the page's life
  // svelte-ignore state_referenced_locally
  const board = params.board
  // The kiosk's token comes in the URL once; it is kept in memory only
  const token = new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('k')
  if (token !== null) history.replaceState(null, '', window.location.pathname + window.location.search + `#/big-screen/${board}`)

  const store = createBigScreenStore(board, token)
  const message = store.message
  const connected = store.connected
  const stopped = store.stopped
  onDestroy(() => store.destroy())

  // The owner's own settings when signed in here, else the owner's account settings from the message
  const settings = $derived(
    $currentUser ? { ...loadSettings(localStorage), ...($accountSettings ?? {}) } : kioskSettings($message?.prefs ?? {}),
  )

  // Same object while the settings are equal: the audio below is built once, not per message
  const memo = createSettingsMemo()
  const stable = $derived(memo(settings))
  let audio: ReturnType<typeof createBigScreenAudio> | null = null
  let prev: Snapshot | null = null
  // Around the Clock's visits are tracked here, as on the match screen (X01 sends them with the snapshot)
  let visits = $state.raw<VisitHistory>(emptyHistory())
  let asleep = $state(false)
  $effect(() => {
    audio?.destroy()
    audio = createBigScreenAudio({ settings: stable, kiosk: !$currentUser })
    return () => audio?.destroy()
  })
  $effect(() => {
    const screen = $message?.screen
    const next = screen && screen.kind !== 'idle' ? screen.snapshot : null
    if (next) audio?.onSnapshot(prev, next)
    const atc = gameState(next).atc
    if (atc)
      visits = trackVisits(
        untrack(() => (next?.sessionId === prev?.sessionId ? visits : emptyHistory())),
        atc,
      )
    prev = next
  })

  let now = $state(Date.now())
  onMount(() => {
    const wake = () => audio?.wake()
    const showCursor = hideCursor()
    window.addEventListener('pointerdown', wake)
    window.addEventListener('keydown', wake)
    const t = setInterval(() => {
      now = Date.now()
      asleep = audio?.asleep() ?? false
    }, 1000)
    return () => {
      window.removeEventListener('pointerdown', wake)
      window.removeEventListener('keydown', wake)
      clearInterval(t)
      showCursor()
    }
  })

  const screen = $derived($message?.screen ?? null)
  const until = $derived($message?.screen.kind === 'result' ? $message.screen.until : null)
  const countdown = $derived.by(() => {
    const s = Math.max(0, Math.ceil(((until ?? now) - now) / 1000))
    return `Board screen in ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
  })

  // The frame stays loaded while idle, so a game starts without reloading the app inside it
  const frameData = $derived(
    screen !== null && screen.kind !== 'idle'
      ? { screen, board: $message?.board ?? { online: false }, settings, history: visits, countdown }
      : null,
  )
</script>

<div>
  <Stage>
    {#snippet children(orientation)}
      <div class="relative size-full">
        <div class="size-full" class:invisible={frameData === null}><MatchFrame data={frameData} /></div>
        {#if screen?.kind === 'idle'}
          <div class="absolute inset-0 bg-bg">
            <Idle name={$message?.board.name ?? ''} online={$message?.board.online ?? false} {orientation} />
          </div>
        {/if}
      </div>
    {/snippet}
  </Stage>
  {#if $stopped}
    <div class="fixed inset-0 flex items-center justify-center text-[40px] text-text-muted" role="status">Stopped</div>
  {:else if !$connected}<Reconnecting />{/if}
  {#if asleep}
    <div class="fixed bottom-6 left-6 rounded-full bg-surface-panel/90 px-4 py-1.5 text-[16px] text-text-muted" role="status">
      Click or tap to enable sound
    </div>
  {/if}
</div>
