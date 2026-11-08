<script lang="ts">
  // The two cards under the rating card on a ranked result: the online average and the record
  // (MM-Result board).
  import type { RankedExtras } from '$lib/ranked/result'

  let { extras }: { extras: RankedExtras } = $props()
</script>

<div class="grid w-full max-w-[560px] grid-cols-2 gap-3 self-center">
  {#each [{ label: 'Online average', value: extras.onlineAverage, line: extras.onlineLine }, { label: 'Record', value: extras.record, line: extras.recordLine }] as card (card.label)}
    <section
      class="box-border flex flex-col gap-1 rounded-card border border-line bg-surface-panel px-4 py-3"
      aria-label="{card.label}: {card.value}"
    >
      <span class="label-caps text-[11px] text-text-muted">{card.label}</span>
      <span class="font-display text-[34px] font-bold leading-none">{card.value}</span>
      <span class="text-[12px] text-text-muted">{card.line}</span>
    </section>
  {/each}
</div>
