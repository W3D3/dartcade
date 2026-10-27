<script lang="ts">
  // The big screen: a view-only page a TV or kiosk opens at #/big-screen/<board>?k=<token>.
  // The board's socket says what to show (idle, the live game, the held result).
  import { onDestroy, onMount } from 'svelte'
  import { currentUser } from '$lib/auth'
  import { accountSettings } from '$lib/accountSettings'
  import { loadSettings } from '$lib/gameSettings'
  import { createBigScreenAudio, createSettingsMemo, kioskSettings } from '$lib/bigscreen/audio'
  import { viewFor } from '$lib/bigscreen/select'
  import { createBigScreenStore } from '$lib/bigscreen/store'
  import type { Snapshot } from '$lib/ws'
  import Stage from '$lib/components/bigscreen/Stage.svelte'
  import Idle from '$lib/components/bigscreen/Idle.svelte'
  import Reconnecting from '$lib/components/bigscreen/Reconnecting.svelte'
  import FallbackCard from '$lib/components/bigscreen/FallbackCard.svelte'

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
    prev = next
  })

  let now = $state(Date.now())
  onMount(() => {
    const wake = () => audio?.wake()
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
    }
  })

  const view = $derived($message ? viewFor($message.screen) : null)
  const until = $derived($message?.screen.kind === 'result' ? $message.screen.until : null)
  const countdown = $derived.by(() => {
    const s = Math.max(0, Math.ceil(((until ?? now) - now) / 1000))
    return `Board screen in ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
  })
  const detail = $derived($message?.screen.kind === 'result' ? ($message.screen.detail ?? null) : null)
</script>

<div class="cursor-none">
  <Stage>
    {#snippet children(orientation)}
      {#if view === null}
        <!-- connecting: a blank stage -->
      {:else if view.kind === 'idle'}
        <Idle name={$message?.board.name ?? ''} online={$message?.board.online ?? false} {orientation} />
      {:else if view.kind === 'fallback'}
        <FallbackCard snapshot={view.snapshot} />
      {:else}
        <view.component snapshot={view.snapshot} {orientation} {countdown} {detail} {settings} />
      {/if}
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
