<script lang="ts">
  // The Dartcade logo and name (the side nav, the sign-in pages, an invite link); badge: the
  // Alpha and preview badges after it; home: the logo and name link to the main page (the
  // badges stay outside the link, the preview badge is a link of its own).
  import { hrefs } from '$lib/routes'
  import BrandMark from './BrandMark.svelte'
  import PreviewBadge from './PreviewBadge.svelte'
  import AlphaBadge from './feedback/AlphaBadge.svelte'

  let {
    size = 28,
    text = 'text-[24px]',
    badge = true,
    home = false,
  }: { size?: number; text?: string; badge?: boolean; home?: boolean } = $props()
</script>

<span class="relative flex items-center gap-[10px]">
  <svelte:element
    this={home ? 'a' : 'span'}
    href={home ? hrefs.home() : undefined}
    class="flex items-center gap-[10px] text-inherit no-underline"
  >
    <BrandMark {size} />
    <span class="font-display font-bold tracking-wordmark {text}">DARTCADE</span>
  </svelte:element>
  {#if badge}<AlphaBadge /><PreviewBadge />{/if}
</span>
