<!--
  A player's round-by-round scores: one chip per round with the number it aimed at and the points it
  scored, the open round outlined, a Shanghai in lime. Rounds not yet played are empty; sudden-death
  bull rounds are added as they are played.
-->
<script lang="ts">
  import type { ShanghaiGame } from '$lib/api/game-ws'
  import { BULL, roundTargets } from '$shared/shanghai'
  import { targetLabel, visitText } from '$lib/shanghai/view'

  let {
    game,
    seat,
    current = false,
    compact = false,
  }: { game: ShanghaiGame; seat: number; current?: boolean; compact?: boolean } = $props()

  const visits = $derived(game.seats[seat].visits)
  const targets = $derived(roundTargets(game.cfg))
  const total = $derived(Math.max(game.rounds, ...visits.map(v => v.round)))
  const cells = $derived(
    Array.from({ length: total }, (_, i) => {
      const round = i + 1
      const visit = visits.find(v => v.round === round)
      return { round, target: visit?.target ?? targets.at(i) ?? BULL, visit }
    }),
  )
</script>

<ol class="flex flex-wrap gap-1" aria-label="Rounds">
  {#each cells as c (c.round)}
    {@const open = current && c.round === game.round && game.phase === 'game'}
    <li
      title="Round {c.round}, {targetLabel(c.target)}: {c.visit ? visitText(c.visit) : 'not played'}"
      class="flex flex-col items-center justify-center rounded-chip box-border {compact ? 'w-7 h-9' : 'w-9 h-11 xl:w-10 xl:h-12'}
             {c.visit?.shanghai
        ? 'bg-accent text-accent-fg'
        : c.visit
          ? 'bg-surface-chip text-text'
          : 'border border-dashed border-line-dashed text-text-dim'}
             {open ? 'outline-2 outline-accent' : ''}"
    >
      <span class="text-caption leading-none {c.visit?.shanghai ? 'text-accent-fg' : 'text-text-dim'}">{targetLabel(c.target)}</span>
      <span class="font-display font-bold leading-none {compact ? 'text-sm' : 'text-lg xl:text-xl'}"
        >{c.visit ? (c.visit.score === 0 ? '–' : c.visit.score) : ''}</span
      >
    </li>
  {/each}
</ol>
