<script lang="ts">
  // A room's picture (the treasure, rest and event artboards): the party and one prop on a floor, a glow
  // behind the prop. The party stands either side of the prop (the first half to its left). Sized by
  // --u, the screen pixels per sprite pixel, which the room sets per breakpoint.
  import type { Snippet } from 'svelte'
  import type { DungeonGame } from '$lib/api/game-ws'
  import { classOf } from '$lib/dungeon/view'
  import type { SpriteId } from '$lib/dungeon/sprites'
  import PixelSprite from './PixelSprite.svelte'

  let {
    heroes,
    prop,
    glow,
    propScale = 1.3,
    label,
    class: className = '',
    children,
  }: {
    heroes: DungeonGame['heroes']
    prop: SpriteId
    /** The glow behind the prop, `r,g,b`. */
    glow: string
    /** The prop's pixels against the party's. */
    propScale?: number
    label: string
    class?: string
    /** Drawn over the picture (the room's effects). */
    children?: Snippet
  } = $props()
  const classes = $derived(heroes.flatMap(h => classOf(h) ?? []))
  const left = $derived(classes.slice(0, Math.ceil(classes.length / 2)))
  const right = $derived(classes.slice(left.length))
</script>

<section
  aria-label={label}
  style:--pu="calc(var(--u) * {propScale})"
  class="relative flex items-end justify-center gap-[calc(var(--u)*3)] overflow-hidden rounded-xl border-2 border-dg-line bg-[radial-gradient(ellipse_at_50%_30%,#2d2438_0%,#1a1420_70%)] pb-[calc(var(--u)*6)] [--u:4px] md:[--u:6px] {className}"
>
  <span aria-hidden="true" class="absolute inset-x-0 bottom-0 top-[72%] bg-linear-to-b from-[#241d2e] to-[#15111b]"></span>
  <span
    aria-hidden="true"
    class="absolute left-1/2 top-1/2 size-[calc(var(--u)*40)] -translate-1/2 rounded-full motion-safe:animate-pulse"
    style:background="radial-gradient(closest-side, rgba({glow}, .45), transparent)"
  ></span>
  <div class="relative flex items-end gap-[calc(var(--u)*3)]">
    {#each left as c (c)}<PixelSprite id={c} scale="fluid" shadow />{/each}
    <span class="mb-[calc(var(--u)*2)] [--u:var(--pu)]"><PixelSprite id={prop} scale="fluid" /></span>
    {#each right as c (c)}<PixelSprite id={c} scale="fluid" shadow />{/each}
  </div>
  {@render children?.()}
</section>
