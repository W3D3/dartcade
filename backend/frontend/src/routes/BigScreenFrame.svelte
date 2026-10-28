<script lang="ts">
  // The inside of the big screen's frame (#/big-screen-frame): the match screen's components drawing what the
  // big screen page posts. No session, layout or toasts of its own; see lib/bigscreen/frame.ts.
  import { onMount } from 'svelte'
  import { FRAME_READY, FRAME_WAKE, isFrameMessage, type FrameState } from '$lib/bigscreen/frame'
  import { audioContext } from '$lib/sounds'
  import { hideCursor } from '$lib/bigscreen/hideCursor'
  import { gameState } from '$lib/gameState'
  import { pendingRoll } from '$lib/minigolf/match'
  import Live from '$lib/components/bigscreen/Live.svelte'
  import Result from '$lib/components/bigscreen/Result.svelte'

  let data = $state.raw<FrameState | null>(null)
  onMount(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== location.origin || e.source !== window.parent) return
      if (isFrameMessage(e.data)) data = e.data.state
      else if (e.data === FRAME_WAKE) audioContext()
    }
    window.addEventListener('message', onMessage)
    window.parent.postMessage(FRAME_READY, location.origin)
    const showCursor = hideCursor()
    return () => {
      window.removeEventListener('message', onMessage)
      showCursor()
    }
  })

  // Minigolf's last stroke rolls before the win screen, as on the match screen; a roll that never reports is given up on
  const ROLL_TIMEOUT_MS = 15000
  // Keyed by session: a stroke key from an earlier game must not skip this game's hold
  let rolled = $state<{ session: string; key: string } | null>(null)
  const session = $derived(data?.screen.snapshot.sessionId ?? '')
  const pending = $derived(
    data?.screen.kind === 'result'
      ? pendingRoll(gameState(data.screen.snapshot).minigolf, rolled?.session === session ? rolled.key : null)
      : null,
  )
  $effect(() => {
    const key = pending
    if (key === null) return
    const t = setTimeout(() => (rolled = { session, key }), ROLL_TIMEOUT_MS)
    return () => clearTimeout(t)
  })
</script>

<div class="flex h-dvh flex-col overflow-hidden bg-bg text-text">
  {#if data}
    {@const screen = data.screen}
    {#if screen.kind === 'result' && pending === null}
      <Result snapshot={screen.snapshot} detail={screen.detail ?? null} countdown={data.countdown} board={data.board} />
    {:else}
      <Live
        snapshot={screen.snapshot}
        board={data.board}
        settings={data.settings}
        history={data.history}
        onrolled={(key: string) => (rolled = { session, key })}
      />
    {/if}
  {/if}
</div>
