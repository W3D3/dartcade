<script lang="ts">
  export let game: Record<string, unknown>
  export let playerIndex: number
  export let isActive: boolean

  $: scores = game.scores as number[] | undefined
  $: remaining = scores?.[playerIndex] ?? 0
  $: opened = (game.opened as boolean[] | undefined)?.[playerIndex] ?? true
  $: outMode = (game.config as any)?.outMode ?? 'double'
  $: legsWon = (game.legs as number[])?.[playerIndex] ?? 0
  $: firstTo = (game.firstTo as number) ?? 3
</script>

<div class="flex flex-col py-6 gap-4 flex-1">
  <!-- Remaining score -->
  <div class="flex items-baseline gap-3">
    <span class="text-8xl font-black tabular-nums leading-none
                 {isActive ? 'text-text' : 'text-[#b4b5aa]'}">
      {remaining}
    </span>
  </div>

  <!-- Out mode + open status -->
  <span class="text-[13px] uppercase tracking-[0.08em]
               {isActive ? 'text-text-muted' : 'text-text-dim'}">
    {outMode} out
    {#if !opened}
      · <span class="text-accent">needs open</span>
    {/if}
  </span>

  <!-- Leg dots -->
  <div class="flex items-center gap-[6px]">
    {#each Array.from({ length: firstTo }, (_, i) => i) as i}
      <span class="w-3 h-3 rounded-full {i < legsWon
        ? (isActive ? 'bg-accent' : 'bg-text-muted')
        : 'border border-[#5a5e53] box-border'}">
      </span>
    {/each}
  </div>
</div>
