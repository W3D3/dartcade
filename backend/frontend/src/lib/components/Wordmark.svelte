<script lang="ts">
  // The Dartcade logo and name (the side nav, the sign-in pages, an invite link); badge: the
  // Alpha and preview badges after it; report: the Alpha badge opens the bug report (signed in).
  import BrandMark from './BrandMark.svelte'
  import PreviewBadge from './PreviewBadge.svelte'
  import AlphaBadge from './feedback/AlphaBadge.svelte'

  let {
    size = 28,
    text = 'text-[24px]',
    badge = true,
    report = false,
  }: { size?: number; text?: string; badge?: boolean; report?: boolean } = $props()
</script>

<span class="relative flex items-center gap-[10px]">
  <BrandMark {size} />
  <span class="font-display font-bold tracking-[0.06em] {text}">DARTCADE</span>
  {#if badge}<AlphaBadge interactive={report} /><PreviewBadge />{/if}
</span>
