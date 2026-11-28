<script lang="ts">
  // A Dungeon pixel sprite (lib/dungeon/sprites.ts) at `scale` screen pixels per sprite pixel. `flip`
  // turns it to face left (enemies), `outline` draws the rarity outline around its silhouette, `shadow`
  // the dithered ground shadow under a character.
  import { ALL_SPRITES, type SpriteId } from '$lib/dungeon/sprites'
  import { spriteRects } from '$lib/dungeon/view'

  let {
    id,
    scale = 4,
    flip = false,
    outline = null,
    shadow = false,
    label = null,
    class: className = '',
  }: {
    id: SpriteId
    /** Screen pixels per sprite pixel; 'fluid' reads the CSS variable --u from an ancestor, so a screen scales its pictures per breakpoint. */
    scale?: number | 'fluid'
    flip?: boolean
    outline?: string | null
    shadow?: boolean
    label?: string | null
    class?: string
  } = $props()
  const sprite = $derived(ALL_SPRITES[id])
  const rects = $derived(spriteRects(sprite, outline))
  const height = $derived(sprite.h + (shadow ? 2 : 0))
  // The canvas's ground shadow: every other pixel of a flat ellipse under the feet
  const dither = $derived(
    shadow
      ? Array.from({ length: 3 * sprite.w }, (_, i) => ({ x: i % sprite.w, y: Math.floor(i / sprite.w) })).filter(
          p => (p.x + p.y) % 2 === 0 && ((p.x + 0.5 - sprite.w / 2) / (sprite.w * 0.42)) ** 2 + ((p.y + 0.5 - 1.5) / 1.4) ** 2 <= 1,
        )
      : [],
  )
</script>

<svg
  width={scale === 'fluid' ? undefined : sprite.w * scale}
  height={scale === 'fluid' ? undefined : height * scale}
  style:width={scale === 'fluid' ? `calc(${sprite.w} * var(--u))` : undefined}
  style:height={scale === 'fluid' ? `calc(${height} * var(--u))` : undefined}
  viewBox="0 0 {sprite.w} {height}"
  shape-rendering="crispEdges"
  class="block shrink-0 {className}"
  role={label ? 'img' : undefined}
  aria-label={label ?? undefined}
  aria-hidden={label ? undefined : 'true'}
>
  {#each dither as p (`${p.x},${p.y}`)}<rect x={p.x} y={sprite.h - 1 + p.y} width="1" height="1" fill="#0a0710" />{/each}
  <g transform={flip ? `translate(${sprite.w} 0) scale(-1 1)` : undefined}>
    {#each rects as r (`${r.x},${r.y}`)}<rect x={r.x} y={r.y} width={r.w} height={r.h} fill={r.fill} />{/each}
  </g>
</svg>
