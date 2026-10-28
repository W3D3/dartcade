<script lang="ts">
  // The match screen's components in a frame 1536 px wide (landscape), scaled up to the stage: see lib/bigscreen/frame.ts.
  import { onMount } from 'svelte'
  import { FRAME_HASH, FRAME_READY, FRAME_SCALE, FRAME_WAKE, type FrameMessage, type FrameState } from '$lib/bigscreen/frame'

  let { data }: { data: FrameState | null } = $props()
  let width = $state(0)
  let height = $state(0)
  let frame: HTMLIFrameElement | undefined = $state()
  // Counts the frame's hellos: a frame that reloads asks again
  let hellos = $state(0)

  onMount(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin === location.origin && e.source === frame?.contentWindow && e.data === FRAME_READY) hellos++
    }
    // The frame covers the stage but takes no taps (pointer-events-none): the page hears them and passes the wake on
    const wake = () => frame?.contentWindow?.postMessage(FRAME_WAKE, location.origin)
    window.addEventListener('message', onMessage)
    window.addEventListener('pointerdown', wake)
    window.addEventListener('keydown', wake)
    return () => {
      window.removeEventListener('message', onMessage)
      window.removeEventListener('pointerdown', wake)
      window.removeEventListener('keydown', wake)
    }
  })
  $effect(() => {
    const message: FrameMessage = { type: 'bigscreen.state', state: data && $state.snapshot(data) }
    if (hellos > 0) frame?.contentWindow?.postMessage(message, location.origin)
  })
</script>

<div class="size-full overflow-hidden bg-bg" bind:clientWidth={width} bind:clientHeight={height}>
  <iframe
    bind:this={frame}
    title="Game"
    src="{location.pathname}{FRAME_HASH}"
    class="pointer-events-none block origin-top-left border-0"
    style="width:{width / FRAME_SCALE}px;height:{height / FRAME_SCALE}px;transform:scale({FRAME_SCALE})"
  ></iframe>
</div>
