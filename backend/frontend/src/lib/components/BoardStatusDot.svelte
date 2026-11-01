<script lang="ts">
  import { LoaderCircle } from '@lucide/svelte'
  import { DOT_BG, DOT_TEXT, RINGED, SPINNING, bmDotColor } from '$lib/boardStatus'

  // The slot is the ring's size whether or not the ring shows, so a status change never moves the row.
  const SIZES = {
    md: { slot: 'size-6', dot: 'size-3.5' },
    lg: { slot: 'size-9', dot: 'size-[22px]' },
  }

  let {
    status,
    online,
    size = 'md',
  }: {
    status: string | null
    online: boolean
    /** md for rows and buttons, lg for the big screen. */
    size?: keyof typeof SIZES
  } = $props()

  const color = $derived(bmDotColor(status, online))
  const ringed = $derived(online && RINGED.has(status ?? ''))
  const spinning = $derived(online && SPINNING.has(status ?? ''))
  const { slot, dot } = $derived(SIZES[size])
</script>

<span class="relative inline-flex shrink-0 items-center justify-center {slot} {DOT_TEXT[color]}" aria-hidden="true">
  {#if spinning}
    <LoaderCircle class="animate-spin motion-reduce:animate-pulse {dot}" strokeWidth={3} />
  {:else}
    <span class="rounded-full {dot} {DOT_BG[color]}"></span>
  {/if}
  {#if ringed}
    <span
      class="absolute inset-0 rounded-full border-[3px] border-current border-t-transparent animate-spin
             motion-reduce:animate-pulse motion-reduce:border-t-current"
    ></span>
  {/if}
</span>
