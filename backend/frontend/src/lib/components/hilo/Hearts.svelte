<!--
  Higher Lower lives: a full heart per life left, an outline per life lost. `justLost` marks the
  heart lost in the visit that just ended: it pulses (unless reduced motion is on).
-->
<script lang="ts">
  let {
    lives,
    total,
    size = 'w-12 h-12',
    tone = 'accent',
    justLost = false,
  }: {
    lives: number
    total: number
    /** Width and height classes, e.g. 'w-8 h-8 xl:w-12 xl:h-12'. */
    size?: string
    /** The fill of a full heart: the thrower's (and the life-lost panel's) lime, or the others' grey. */
    tone?: 'accent' | 'muted'
    justLost?: boolean
  } = $props()

  const HEART =
    'M12 20.5s-7.8-4.7-9.6-9.6C1.2 7.6 3.4 4.5 6.8 4.5c2.2 0 3.9 1.3 5.2 3.1 1.3-1.8 3-3.1 5.2-3.1 3.4 0 5.6 3.1 4.4 6.4C19.8 15.8 12 20.5 12 20.5z'
  const CRACK = 'M12 7.6l-1.8 3.6 2.8 1.6-1.6 3.8'
  const fill = $derived(tone === 'accent' ? 'var(--color-accent)' : 'var(--color-ink-3)')
  const label = $derived(
    lives === 0 ? 'No lives left' : `${lives} of ${total} ${total === 1 ? 'life' : 'lives'} left${justLost ? ', one just lost' : ''}`,
  )
</script>

<div role="img" aria-label={label} class="flex flex-wrap gap-[6px]">
  {#each { length: total } as _, i (i)}
    {#if justLost && i === lives}
      <span class="relative block shrink-0 {size}">
        <span class="ping absolute inset-[12.5%] box-border rounded-full border-2 border-live"></span>
        <svg class="fade absolute inset-0 w-full h-full" viewBox="0 0 24 24" aria-hidden="true">
          <path d={HEART} fill="var(--color-live)" fill-opacity="0.3" stroke="var(--color-live)" stroke-width="1.6" />
          <path d={CRACK} fill="none" stroke="var(--color-bg)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </span>
    {:else}
      <svg class="shrink-0 {size}" viewBox="0 0 24 24" aria-hidden="true">
        {#if i < lives}
          <path d={HEART} {fill} />
        {:else}
          <path d={HEART} fill="none" stroke="var(--color-line-chip)" stroke-width="1.6" />
        {/if}
      </svg>
    {/if}
  {/each}
</div>

<style>
  @media (prefers-reduced-motion: no-preference) {
    .ping {
      transform-origin: center;
      animation: ping 1.6s ease-out infinite;
    }
    .fade {
      animation: fade 1.6s ease-in-out infinite alternate;
    }
  }
  @keyframes ping {
    0% {
      transform: scale(1);
      opacity: 0.85;
    }
    100% {
      transform: scale(1.9);
      opacity: 0;
    }
  }
  @keyframes fade {
    0%,
    30% {
      opacity: 1;
    }
    100% {
      opacity: 0.35;
    }
  }
</style>
