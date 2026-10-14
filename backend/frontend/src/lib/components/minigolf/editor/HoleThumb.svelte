<script lang="ts">
  // A hole drawn small and still (the course editor's rows, cards and course list), ball on the tee.
  import HoleView from '../HoleView.svelte'
  import { toHole } from '$lib/minigolf/editor/store.svelte'
  import type { components } from '$lib/api/schema'

  let { hole, class: className = 'w-[72px] h-[44px]' }: { hole: components['schemas']['MinigolfHole'] | null; class?: string } = $props()
  const shown = $derived(hole && toHole(hole))
</script>

<!-- pointer-events-none: HoleView's svg is touch-none, which would stop the list scrolling on touch -->
<div class="shrink-0 overflow-hidden rounded-[6px] bg-surface-inset pointer-events-none {className}" aria-hidden="true">
  {#if shown}<HoleView hole={shown} ball={shown.tee} halo={false} />{/if}
</div>
