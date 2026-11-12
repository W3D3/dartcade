<script lang="ts">
  // What an in-person spot is: CLAIMED (by an account), GUEST, or EMPTY (a team's open spot).
  import { Check } from '@lucide/svelte'

  let { state, by = null }: { state: 'claimed' | 'guest' | 'empty'; by?: string | null } = $props()
</script>

{#if state === 'claimed'}
  <span class="inline-flex h-[22px] shrink-0 items-center gap-1 rounded-full bg-accent-tint px-2 text-caption font-bold text-accent">
    <Check size={12} aria-hidden="true" />CLAIMED{#if by}<span class="font-semibold normal-case">&nbsp;by @{by}</span>{/if}
  </span>
{:else}
  <span
    class="inline-flex h-[22px] shrink-0 items-center rounded-full px-2 text-caption font-bold
           {state === 'guest' ? 'bg-surface-chip text-ink-2' : 'border border-dashed border-line-dashed text-text-dim'}"
    >{state === 'guest' ? 'GUEST' : 'EMPTY'}</span
  >
{/if}
