<script lang="ts">
  // A small pill over the board's top-right corner to flip between the drawn board and a
  // camera's still, without opening the settings drawer. Writes the same boardView setting
  // the drawer does, so the two stay in sync (design: docs/superpowers/specs/2026-10-04-camera-view-design.md).
  import { Camera, Target } from '@lucide/svelte'
  import type { Snapshot } from '$lib/api/game-ws'
  import { cameraSideView, cameraStillUrl, pickBoardView, type CameraVersions } from '$lib/camera.js'
  import { BOARD_VIEW_LABELS, type GameSettings } from '$lib/gameSettings.js'

  let {
    settings = $bindable(),
    snapshot,
    cameraVersions,
  }: {
    settings: GameSettings
    snapshot: Snapshot | null
    cameraVersions: CameraVersions
  } = $props()

  // The camera this toggle's right option shows: the current one, or the remembered one while drawn
  const cameraView = $derived(cameraSideView(settings.boardView, settings.lastCameraView))
  const onCamera = $derived(settings.boardView !== 'svg')
  // Only shown when that camera could actually show something right now (board online, not
  // manual entry, a still exists) — the same check the board itself uses to fall back to drawn
  const available = $derived(cameraStillUrl(snapshot, cameraView, cameraVersions) !== null)

  function pick(side: 'drawn' | 'camera') {
    const next = pickBoardView(settings.boardView, settings.lastCameraView, side)
    settings.boardView = next.boardView
    settings.lastCameraView = next.lastCameraView
  }
</script>

{#if available}
  <!-- The pill sits over the board; only it takes clicks, not the area around it -->
  <div class="absolute inset-0 flex items-start justify-end p-2 pointer-events-none">
    <div
      role="radiogroup"
      aria-label="Board view"
      class="pointer-events-auto flex gap-0.5 p-0.5 rounded-full bg-[rgba(10,11,9,0.65)] backdrop-blur-sm"
    >
      <button
        type="button"
        role="radio"
        aria-checked={!onCamera}
        aria-label="Drawn board"
        onclick={() => pick('drawn')}
        class="w-6 h-6 flex items-center justify-center rounded-full border-0 cursor-pointer transition-colors
               {!onCamera ? 'bg-white/20 text-white' : 'bg-transparent text-white/60'}"
      >
        <Target size={14} /></button
      >
      <button
        type="button"
        role="radio"
        aria-checked={onCamera}
        aria-label="{BOARD_VIEW_LABELS[cameraView]} camera"
        onclick={() => pick('camera')}
        class="w-6 h-6 flex items-center justify-center rounded-full border-0 cursor-pointer transition-colors
               {onCamera ? 'bg-white/20 text-white' : 'bg-transparent text-white/60'}"
      >
        <Camera size={14} /></button
      >
    </div>
  </div>
{/if}
