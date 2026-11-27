<script lang="ts">
  // An artifact's sprite in its rarity outline. Hover (or tap, or focus and Enter) shows what it does:
  // the sprite, name, rarity, owner, effect and when it fires (Dungeon-Pixel-Map's popups).
  import { Popover } from 'bits-ui'
  import { ARTIFACTS, type ArtifactId } from '$shared/dungeon/content/artifacts'
  import { RARITY_COLOR } from '$lib/dungeon/view'
  import PixelSprite from './PixelSprite.svelte'

  let { id, owner = null, scale = 3 }: { id: ArtifactId; owner?: string | null; scale?: number } = $props()
  const entry = $derived(ARTIFACTS[id])
  const colour = $derived(RARITY_COLOR[entry.rarity])
  let open = $state(false)
</script>

<svelte:window onscrollcapture={() => (open = false)} />

<Popover.Root bind:open>
  <Popover.Trigger
    type="button"
    aria-label="{entry.name}, {entry.rarity} artifact"
    class="rounded-md p-1 hover:bg-dg-raised focus-visible:outline-2 focus-visible:outline-dg-gold"
    onpointerenter={(e: PointerEvent) => e.pointerType === 'mouse' && (open = true)}
    onpointerleave={(e: PointerEvent) => e.pointerType === 'mouse' && (open = false)}
  >
    <PixelSprite {id} {scale} outline={colour} />
  </Popover.Trigger>
  <Popover.Portal>
    <Popover.Content
      side="bottom"
      sideOffset={8}
      collisionPadding={8}
      class="z-60 flex w-[260px] gap-3 rounded-lg border-2 border-dg-line bg-dg-panel p-3 text-dg-text shadow-tooltip"
    >
      <PixelSprite {id} scale={4} outline={colour} />
      <div class="flex min-w-0 flex-col gap-1">
        <span class="font-display text-lg font-bold uppercase leading-none">{entry.name}</span>
        <span class="text-sm" style:color={colour}>{entry.rarity}{owner ? ` · ${owner}` : ''}</span>
        <span class="text-sm">{entry.description}</span>
        <span class="text-xs uppercase tracking-wide text-dg-muted">{entry.trigger}</span>
      </div>
    </Popover.Content>
  </Popover.Portal>
</Popover.Root>
