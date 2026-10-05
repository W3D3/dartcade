// Drag to reorder, for lists whose order the server keeps (the lobby's people, its teams).
// The element it's used on holds one or more zones (`data-sortable-zone`, the element itself
// may be one), each with items (`data-sortable-id`); a drag starts only from an item's
// handle (`data-sortable-handle`, a <button> with `touch-action: none`, so the page still
// scrolls everywhere else). Pointer events cover mouse, touch and pen. While dragging, the
// item follows the pointer and the drop spot is marked with `data-drop` (styled in app.css);
// Escape cancels. On the handle, the arrow keys move the item instead.
//
// It only reports where the item was dropped; the list decides what that means and the
// next snapshot redraws it.
import type { Action } from 'svelte/action'
import type { Direction } from '$lib/lobby/dnd'

export type SortableDrop = { id: string; zone: string; beforeId: string | null }

export type SortableOptions = {
  ondrop: (drop: SortableDrop) => void
  /** An arrow key on a handle. */
  onkey?: (id: string, dir: Direction) => void
  /** Escape (or the browser took the pointer) mid-drag. */
  oncancel?: () => void
}

type Box = { top: number; bottom: number; left: number; right: number }
export type ZoneBox = { zone: string; box: Box; items: { id: string; box: Box }[] }

/** How far the pointer moves before a press on the handle becomes a drag. */
const THRESHOLD = 4
/** The band at the scroll area's top and bottom edge that scrolls while dragging. */
const EDGE = 48
const MAX_SPEED = 14

const distance = (b: Box, x: number, y: number): number =>
  Math.hypot(Math.max(b.left - x, 0, x - b.right), Math.max(b.top - y, 0, y - b.bottom))

/**
 * Where the pointer would drop the item: the zone under it (or the nearest one), before the
 * first other item whose middle is below the pointer; null beforeId: at the end.
 */
export function dropTarget(zones: ZoneBox[], draggedId: string, x: number, y: number): { zone: string; beforeId: string | null } | null {
  let best: ZoneBox | null = null
  for (const z of zones) if (best === null || distance(z.box, x, y) < distance(best.box, x, y)) best = z
  if (best === null) return null
  const before = best.items.find(i => i.id !== draggedId && y < (i.box.top + i.box.bottom) / 2)
  return { zone: best.zone, beforeId: before?.id ?? null }
}

/** Pixels per frame to scroll: negative near the top edge, positive near the bottom, else 0. */
export function edgeSpeed(y: number, top: number, bottom: number): number {
  if (y < top + EDGE) return -Math.ceil(MAX_SPEED * Math.min(1, (top + EDGE - y) / EDGE))
  if (y > bottom - EDGE) return Math.ceil(MAX_SPEED * Math.min(1, (y - (bottom - EDGE)) / EDGE))
  return 0
}

const KEYS = new Map<string, Direction>([
  ['ArrowUp', 'up'],
  ['ArrowDown', 'down'],
  ['ArrowLeft', 'left'],
  ['ArrowRight', 'right'],
])

function scrollerOf(el: HTMLElement): Element | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const o = getComputedStyle(p).overflowY
    if ((o === 'auto' || o === 'scroll') && p.scrollHeight > p.clientHeight) return p
  }
  return document.scrollingElement
}

const elements = (root: HTMLElement, selector: string): HTMLElement[] => {
  const found = [...root.querySelectorAll(selector)].filter(e => e instanceof HTMLElement)
  return root.matches(selector) ? [root, ...found] : found
}

export const sortable: Action<HTMLElement, SortableOptions> = (root, initial) => {
  let opts = initial
  type Drag = {
    id: string
    item: HTMLElement
    handle: HTMLElement
    pointerId: number
    startX: number
    startY: number
    x: number
    y: number
    started: boolean
    scroller: Element | null
    startScroll: number
    target: SortableDrop | null
    frame: number
  }
  let drag: Drag | null = null

  const clearMarks = () => {
    for (const el of elements(root, '[data-drop]')) delete el.dataset.drop
  }

  function mark(target: { zone: string; beforeId: string | null } | null, d: Drag) {
    clearMarks()
    if (!target) return
    const zone = elements(root, '[data-sortable-zone]').find(z => z.dataset.sortableZone === target.zone)
    if (!zone) return
    const items = elements(zone, '[data-sortable-id]').filter(i => i.dataset.sortableId !== d.id)
    const before = items.find(i => i.dataset.sortableId === target.beforeId)
    const last = items.at(-1)
    if (before) before.dataset.drop = 'before'
    else if (last) last.dataset.drop = 'after'
    else zone.dataset.drop = 'end'
  }

  function boxes(): ZoneBox[] {
    return elements(root, '[data-sortable-zone]').map(z => ({
      zone: z.dataset.sortableZone ?? '',
      box: z.getBoundingClientRect(),
      // Only this zone's own items, not those of a zone inside it
      items: elements(z, '[data-sortable-id]')
        .filter(i => i.closest('[data-sortable-zone]') === z)
        .map(i => ({ id: i.dataset.sortableId ?? '', box: i.getBoundingClientRect() })),
    }))
  }

  const scrollTop = (d: Drag) => d.scroller?.scrollTop ?? 0

  function render(d: Drag) {
    const zones = boxes()
    const dy = d.y - d.startY + (scrollTop(d) - d.startScroll)
    // A single list only moves up and down; with more than one, the item goes where the pointer goes
    const dx = zones.length > 1 ? d.x - d.startX : 0
    d.item.style.transform = `translate(${dx}px, ${dy}px)`
    const t = dropTarget(zones, d.id, d.x, d.y)
    d.target = t && { id: d.id, ...t }
    mark(t, d)
  }

  function autoscroll() {
    const d = drag
    if (!d) return
    const s = d.scroller
    if (s) {
      const r = s === document.scrollingElement ? { top: 0, bottom: window.innerHeight } : s.getBoundingClientRect()
      const speed = edgeSpeed(d.y, Math.max(r.top, 0), Math.min(r.bottom, window.innerHeight))
      if (speed !== 0) {
        const was = s.scrollTop
        s.scrollTop += speed
        if (s.scrollTop !== was) render(d)
      }
    }
    d.frame = requestAnimationFrame(autoscroll)
  }

  function start(d: Drag) {
    d.started = true
    d.item.dataset.dragging = ''
    d.item.style.zIndex = '20'
    document.documentElement.dataset.sorting = ''
    window.addEventListener('keydown', onescape, true)
    d.frame = requestAnimationFrame(autoscroll)
  }

  /** drop: report where it landed; cancel: report the cancel; quiet: just clean up. */
  function finish(how: 'drop' | 'cancel' | 'quiet') {
    const d = drag
    if (!d) return
    drag = null
    d.handle.removeEventListener('pointermove', onmove)
    d.handle.removeEventListener('pointerup', onup)
    d.handle.removeEventListener('pointercancel', oncancelled)
    d.handle.removeEventListener('lostpointercapture', oncancelled)
    if (d.handle.hasPointerCapture(d.pointerId)) d.handle.releasePointerCapture(d.pointerId)
    if (!d.started) return
    cancelAnimationFrame(d.frame)
    window.removeEventListener('keydown', onescape, true)
    clearMarks()
    delete d.item.dataset.dragging
    d.item.style.transform = ''
    d.item.style.zIndex = ''
    delete document.documentElement.dataset.sorting
    if (how === 'drop' && d.target) opts.ondrop(d.target)
    else if (how === 'cancel') opts.oncancel?.()
  }

  function onmove(e: PointerEvent) {
    const d = drag
    if (!d || e.pointerId !== d.pointerId) return
    d.x = e.clientX
    d.y = e.clientY
    if (!d.started) {
      if (Math.hypot(d.x - d.startX, d.y - d.startY) < THRESHOLD) return
      start(d)
    }
    render(d)
  }
  const onup = (e: PointerEvent) => {
    if (drag && e.pointerId === drag.pointerId) finish('drop')
  }
  const oncancelled = () => finish('cancel')
  function onescape(e: KeyboardEvent) {
    if (e.key !== 'Escape') return
    e.preventDefault()
    e.stopPropagation()
    finish('cancel')
  }

  function onpointerdown(e: PointerEvent) {
    if (drag || !e.isPrimary || e.button !== 0 || !(e.target instanceof Element)) return
    const handle = e.target.closest('[data-sortable-handle]')
    const item = handle?.closest('[data-sortable-id]')
    if (!(handle instanceof HTMLElement) || !(item instanceof HTMLElement) || !root.contains(item)) return
    const id = item.dataset.sortableId
    if (!id) return
    handle.setPointerCapture(e.pointerId)
    const scroller = scrollerOf(root)
    drag = {
      id,
      item,
      handle,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      x: e.clientX,
      y: e.clientY,
      started: false,
      scroller,
      startScroll: scroller?.scrollTop ?? 0,
      target: null,
      frame: 0,
    }
    handle.addEventListener('pointermove', onmove)
    handle.addEventListener('pointerup', onup)
    handle.addEventListener('pointercancel', oncancelled)
    handle.addEventListener('lostpointercapture', oncancelled)
  }

  function onkeydown(e: KeyboardEvent) {
    const dir = KEYS.get(e.key)
    if (drag || !dir || !opts.onkey || !(e.target instanceof HTMLElement) || !e.target.matches('[data-sortable-handle]')) return
    const item = e.target.closest('[data-sortable-id]')
    const id = item instanceof HTMLElement ? item.dataset.sortableId : undefined
    if (!id) return
    e.preventDefault()
    opts.onkey(id, dir)
    // The item may have moved to another list (or been redrawn): keep the focus on its handle
    requestAnimationFrame(() => {
      const item = elements(root, '[data-sortable-id]').find(i => i.dataset.sortableId === id)
      const h = item?.querySelector('[data-sortable-handle]')
      if (h instanceof HTMLElement && document.activeElement !== h) h.focus()
    })
  }

  root.addEventListener('pointerdown', onpointerdown)
  root.addEventListener('keydown', onkeydown)
  return {
    update(next: SortableOptions) {
      opts = next
    },
    destroy() {
      finish('quiet')
      root.removeEventListener('pointerdown', onpointerdown)
      root.removeEventListener('keydown', onkeydown)
    },
  }
}
