<script lang="ts" module>
  import { ArrowUp, Ban, Flame, Shield, Snowflake } from '@lucide/svelte'
  import type { StatusKind } from '$lib/dungeon/battle'

  // Each chip's icon and colour (Dungeon-Pixel-Battle's enemy plates)
  const LOOK = {
    weak: { icon: ArrowUp, colour: '#5bd37a' },
    immune: { icon: Ban, colour: '#c9bfd8' },
    resist: { icon: Shield, colour: '#f2a33a' },
    chill: { icon: Snowflake, colour: '#5aa0e8' },
    burn: { icon: Flame, colour: '#ff8a4c' },
  } as const satisfies Record<StatusKind, unknown>
</script>

<script lang="ts">
  // An enemy's defence or status as an icon chip with a short value; hover (or tap, or focus and
  // Enter) says what it means
  import { Popover } from 'bits-ui'

  let { kind, value, title, small = false }: { kind: StatusKind; value: string; title: string; small?: boolean } = $props()
  const look = $derived(LOOK[kind])
  let open = $state(false)
</script>

<Popover.Root bind:open>
  <Popover.Trigger
    type="button"
    aria-label={title}
    class="inline-flex shrink-0 items-center gap-1 rounded-md border bg-dg-bg font-display font-bold leading-none focus-visible:outline-2 focus-visible:outline-dg-gold {small
      ? 'h-6 px-1.5 text-sm'
      : 'h-7 px-[7px] text-base'}"
    style="border-color: {look.colour}; color: {look.colour}"
    onpointerenter={(e: PointerEvent) => e.pointerType === 'mouse' && (open = true)}
    onpointerleave={(e: PointerEvent) => e.pointerType === 'mouse' && (open = false)}
  >
    <look.icon class="size-3.5" aria-hidden="true" />{value}
  </Popover.Trigger>
  <Popover.Portal>
    <Popover.Content
      side="top"
      sideOffset={6}
      collisionPadding={8}
      class="z-60 max-w-[240px] rounded-lg border-2 border-dg-line bg-dg-panel px-3 py-2 text-sm text-dg-text shadow-tooltip"
      >{title}</Popover.Content
    >
  </Popover.Portal>
</Popover.Root>
