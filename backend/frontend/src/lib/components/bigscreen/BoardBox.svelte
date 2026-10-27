<script lang="ts">
  // The dartboard centred in whatever room the layout gives it, drawn with the open visit's darts.
  import type { BoardProps } from '$lib/bigscreen/tiles'
  import DartBoard from '$lib/components/DartBoard.svelte'
  let props: BoardProps = $props()
</script>

<div class="flex size-full items-center justify-center [container-type:size]">
  <div class="aspect-square" style="width:min(100cqw,100cqh)">
    <DartBoard {...props} />
  </div>
</div>
