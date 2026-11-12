<script lang="ts">
  // The Dartcade logo and name (the side nav, the sign-in pages, an invite link); badge: the
  // Alpha and preview badges after it.
  import BrandMark from './BrandMark.svelte'
  import PreviewBadge from './PreviewBadge.svelte'
  import AlphaBadge from './feedback/AlphaBadge.svelte'

  let { size = 28, text = 'text-[24px]', badge = true }: { size?: number; text?: string; badge?: boolean } = $props()
</script>

<span class="relative flex items-center gap-[10px]">
  <BrandMark {size} />
  <span class="font-display font-bold tracking-wordmark {text}">DARTCADE</span>
  {#if badge}<AlphaBadge /><PreviewBadge />{/if}
</span>
