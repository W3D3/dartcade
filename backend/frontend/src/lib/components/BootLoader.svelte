<!-- The full screen before the app knows who is signed in: the Dartcade mark, breathing. The same
     picture is in index.html (#boot), so the page never flashes between the two. -->
<script lang="ts">
  import BrandMark from './BrandMark.svelte'
</script>

<div role="status" class="fixed inset-0 z-50 flex items-center justify-center bg-bg">
  <span class="animate-pulse motion-reduce:animate-none"><BrandMark size={56} /></span>
  <span class="sr-only">Loading Dartcade</span>
</div>
