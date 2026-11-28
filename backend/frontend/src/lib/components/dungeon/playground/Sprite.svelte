<!-- The shared pixel sprite for a registry id, or nothing: content added to a registry has no sprite until someone draws one. -->
<script lang="ts">
  import { SPRITES, type SpriteId } from '$lib/dungeon/sprites'
  import PixelSprite from '../PixelSprite.svelte'

  let { id, scale = 3, flip = false, outline = null }: { id: string; scale?: number; flip?: boolean; outline?: string | null } = $props()
  const isSpriteId = (s: string): s is SpriteId => Object.hasOwn(SPRITES, s)
</script>

{#if isSpriteId(id)}<PixelSprite {id} {scale} {flip} {outline} />{/if}
