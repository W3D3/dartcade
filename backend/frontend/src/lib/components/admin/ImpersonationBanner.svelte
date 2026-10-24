<!-- Shown on every page while an admin views the app as someone else: who, and the way back. -->
<script lang="ts">
  import { Eye } from '@lucide/svelte'
  import { Button } from '$lib/components/ui/button/index.js'
  import { stopViewingAs } from '$lib/admin/impersonate'

  let { name }: { name: string } = $props()
  let error = $state('')
  let busy = $state(false)
  // Drag offset from the default spot, so the pill can be moved off whatever it covers.
  let dx = $state(0)
  let dy = $state(0)
  let drag: { x: number; y: number; dx: number; dy: number; rect: DOMRect } | null = null

  function down(e: PointerEvent): void {
    if (e.target instanceof Element && e.target.closest('button')) return
    const el = e.currentTarget
    if (!(el instanceof HTMLElement)) return
    el.setPointerCapture(e.pointerId)
    drag = { x: e.clientX, y: e.clientY, dx, dy, rect: el.getBoundingClientRect() }
  }

  function move(e: PointerEvent): void {
    if (!drag) return
    const { rect } = drag
    // Clamp so the pill stays fully on screen.
    const clamp = (d: number, lo: number, hi: number) => Math.min(Math.max(d, lo), hi)
    dx = drag.dx + clamp(e.clientX - drag.x, -rect.left, innerWidth - rect.right)
    dy = drag.dy + clamp(e.clientY - drag.y, -rect.top, innerHeight - rect.bottom)
  }

  async function stop(): Promise<void> {
    busy = true
    error = ''
    const result = await stopViewingAs()
    busy = false
    if (result) error = result.error
  }
</script>

<div
  role="status"
  style:transform="translate(calc(-50% + {dx}px), {dy}px)"
  onpointerdown={down}
  onpointermove={move}
  onpointerup={() => (drag = null)}
  onpointercancel={() => (drag = null)}
  class="fixed bottom-4 left-1/2 z-[300] flex max-w-[calc(100vw-32px)] cursor-grab touch-none flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-full border border-warn-line bg-surface-hover px-4 py-2 text-[14px] text-text [box-shadow:0_10px_30px_rgba(0,0,0,0.5)]"
>
  <Eye size={16} class="shrink-0 text-warn" aria-hidden="true" />
  <span class="min-w-0 truncate">Viewing as <strong>{name}</strong></span>
  <Button variant="outline" size="sm" onclick={() => void stop()} disabled={busy}>Stop</Button>
  {#if error}<span role="alert" class="basis-full text-center text-[12px] text-live-text">{error}</span>{/if}
</div>
