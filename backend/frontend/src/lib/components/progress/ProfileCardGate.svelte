<!-- Holds a profile card's place while it loads: the skeleton (after a short wait, and for at least a
     moment, so it never flickers) and then the card, fading in. Without a wait the card shows at once. -->
<script lang="ts">
  import type { Snippet } from 'svelte'
  import { loadingGate } from '$lib/loadingGate.svelte'
  import ProfileCardSkeleton from './ProfileCardSkeleton.svelte'

  let {
    loading,
    variant = 'card',
    actions = false,
    class: className = '',
    children,
  }: { loading: boolean; variant?: 'card' | 'hero'; actions?: boolean; class?: string; children: Snippet } = $props()

  const gate = loadingGate(() => loading)
</script>

{#if gate.holding}
  <ProfileCardSkeleton {variant} {actions} revealed={gate.revealed} />
{:else}
  <div class="{className} {gate.waited ? 'fade-in' : ''}">{@render children()}</div>
{/if}
