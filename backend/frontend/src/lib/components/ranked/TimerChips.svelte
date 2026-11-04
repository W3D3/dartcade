<script lang="ts">
  // The Turn and Reserve chips on the thrower's panel. Hidden until the visit or the reserve is
  // nearly gone (`clockView`); then the turn chip counts down in lime, and once it ran out it turns
  // red and the reserve chip takes over (MM-Match, MM-Match-Reserve boards).
  import type { ClockView } from '$lib/ranked/clock'

  let { view }: { view: ClockView } = $props()

  const base = 'inline-flex h-7 items-center gap-[6px] rounded-[6px] border px-[9px] whitespace-nowrap'
</script>

{#if view.phase !== 'hidden'}
  <span class="flex flex-wrap items-center gap-2" role="timer" aria-label="Time left for this visit">
    <span class="{base} {view.phase === 'visit' ? 'border-accent-line-strong text-accent' : 'border-live bg-live-soft text-live-text'}">
      <span class="text-[10px] font-semibold uppercase tracking-[0.1em]">Turn</span>
      <span class="font-mono text-[15px] font-medium">{view.turn}</span>
    </span>
    {#if view.phase === 'reserve'}
      <span class="{base} border-live bg-live-soft text-live-text">
        <span class="text-[10px] font-semibold uppercase tracking-[0.1em]">Reserve</span>
        <span class="font-mono text-[15px] font-medium">{view.reserve}</span>
      </span>
    {/if}
  </span>
{/if}
