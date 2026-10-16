<script lang="ts">
  // The Dartcade logo and name (the side nav, the sign-in pages, an invite link); badge: the
  // preview badge after it.
  import BrandMark from './BrandMark.svelte'
  import PreviewBadge from './PreviewBadge.svelte'

  let { size = 28, text = 'text-[24px]', badge = true }: { size?: number; text?: string; badge?: boolean } = $props()
</script>

<span class="relative flex items-center gap-[10px]">
  <BrandMark {size} />
  <span class="font-display font-bold tracking-[0.06em] {text}">DARTCADE</span>
  {#if badge}<PreviewBadge />{/if}
</span>
