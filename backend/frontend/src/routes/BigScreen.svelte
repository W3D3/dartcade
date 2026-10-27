<script lang="ts">
  // The big screen: a view-only page a TV or kiosk opens at #/big-screen/<board>?k=<token>.
  // The board's socket says what to show (idle, the live game, the held result).
  import type { Component } from 'svelte'
  import { onDestroy, onMount } from 'svelte'
  import { currentUser } from '$lib/auth'
  import { accountSettings } from '$lib/accountSettings'
  import { loadSettings } from '$lib/gameSettings'
  import { gameState } from '$lib/gameState'
  import { createBigScreenAudio, createSettingsMemo, kioskSettings } from '$lib/bigscreen/audio'
  import { viewFor, type ViewKey } from '$lib/bigscreen/select'
  import { createBigScreenStore } from '$lib/bigscreen/store'
  import type { Snapshot } from '$lib/ws'
  import type { GameDetail } from '$lib/api'
  import MinigolfMatch from '$lib/components/minigolf/MinigolfMatch.svelte'
  import Stage from '$lib/components/bigscreen/Stage.svelte'
  import Idle from '$lib/components/bigscreen/Idle.svelte'
  import Reconnecting from '$lib/components/bigscreen/Reconnecting.svelte'
  import FallbackCard from '$lib/components/bigscreen/FallbackCard.svelte'
  import GenericResult from '$lib/components/bigscreen/GenericResult.svelte'
  import X01Live from '$lib/components/bigscreen/X01Live.svelte'
  import X01Win from '$lib/components/bigscreen/X01Win.svelte'

  let { params }: { params: { board: string } } = $props()

  type ViewProps = { snapshot: Snapshot; orientation: 'landscape' | 'portrait'; countdown: string; detail: GameDetail | null }
  // Registration point for the per-game live and win views ('x01', 'x01-win', 'atc', 'p121', 'hilo');
  // a key without a component here shows the fallback card.
  const views: Partial<Record<ViewKey, Component<ViewProps>>> = { x01: X01Live, 'x01-win': X01Win }

  // The board of the route is fixed for the page's life
  // svelte-ignore state_referenced_locally
  const board = params.board
  // The kiosk's token comes in the URL once; it is kept in memory only
  const token = new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('k')
  if (token !== null) history.replaceState(null, '', window.location.pathname + window.location.search + `#/big-screen/${board}`)

  const store = createBigScreenStore(board, token)
  const message = store.message
  const connected = store.connected
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
    audio = createBigScreenAudio({ settings: stable })
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
  const minigolf = $derived(view?.component === 'minigolf' ? gameState(view.snapshot).minigolf : null)
  const Registered = $derived(view ? views[view.component] : undefined)
</script>

<div class="cursor-none">
  <Stage>
    {#snippet children(orientation)}
      {#if view === null}
        <!-- connecting: a blank stage -->
      {:else if view.component === 'idle'}
        <Idle name={$message?.board.name ?? ''} online={$message?.board.online ?? false} {orientation} />
      {:else if view.component === 'minigolf' && minigolf && view.snapshot}
        <MinigolfMatch
          game={minigolf}
          players={view.snapshot.players}
          darts={[]}
          canThrow={false}
          locked={true}
          canUndo={false}
          next={{ prominent: false, enabled: false }}
          onUndo={() => undefined}
          onNext={() => undefined}
          onBoardClick={() => undefined}
          host={false}
          manual={false}
          onNextHole={() => undefined}
          {settings}
        />
      {:else if Registered && view.snapshot}
        <Registered snapshot={view.snapshot} {orientation} {countdown} {detail} />
      {:else if view.component === 'generic-result' && view.snapshot}
        <GenericResult snapshot={view.snapshot} {countdown} />
      {:else}
        <FallbackCard snapshot={view.snapshot} />
      {/if}
    {/snippet}
  </Stage>
  {#if !$connected}<Reconnecting />{/if}
  {#if asleep}
    <div class="fixed bottom-6 left-6 rounded-full bg-surface-panel/90 px-4 py-1.5 text-[16px] text-text-muted">
      Click or tap to enable sound
    </div>
  {/if}
</div>
