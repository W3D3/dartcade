<!--
  The step being played (Mission-Play's player panel): whose run, step X of N, the step's title, its big
  number (progress, the score left, the average), a cell per unit of progress (numbered from the
  tablet up), the rule, and Attempt / Best streak / Darts. `phone`: the short panel of Mission-Play-Phone.
-->
<script lang="ts">
  import type { MissionGame } from '$lib/api/game-ws'
  import Avatar from '$lib/components/Avatar.svelte'
  import type { Who } from '$lib/face'
  import { bigNumber, segments, stepRule } from '$lib/missions/view'
  import { stepTitle } from '$shared/missions/describe'

  let { game, seat, who, phone = false }: { game: MissionGame; seat: number; who: Who; phone?: boolean } = $props()

  const run = $derived(game.runs[seat])
  const i = $derived(run.active)
  const step = $derived(game.mission.steps[i])
  const s = $derived(run.steps[i])
  const big = $derived(bigNumber(step, s.progress))
  const cells = $derived(big.caption === null ? segments(s.progress) : null)
  const pct = $derived(s.progress.of > 0 ? Math.min(100, (100 * s.progress.value) / s.progress.of) : 0)
  const n = $derived(game.mission.steps.length)
  const label = $derived(
    `${who.name}, step ${i + 1}: ${big.value}${big.of === null ? '' : ` of ${big.of}`}${big.caption ? ` ${big.caption}` : ''}`,
  )
</script>

{#snippet progress(tall: boolean)}
  {#if cells}
    <div class="grid gap-[5px]" style="grid-template-columns: repeat({cells.length}, minmax(0, 1fr))" aria-hidden="true">
      {#each cells as c, k (k)}
        <span
          class="flex items-center justify-center rounded-chip font-display font-bold {tall ? 'h-11 text-lead' : 'h-[22px]'}
            {c === 'done'
            ? 'bg-accent text-accent-fg'
            : c === 'next'
              ? 'border-2 border-accent text-accent'
              : 'bg-surface-inset text-text-faint'}">{tall && cells.length <= 12 ? k + 1 : ''}</span
        >
      {/each}
    </div>
  {:else if big.caption === null || big.caption === 'average'}
    <span class="block h-2 overflow-hidden rounded-full bg-surface-inset" aria-hidden="true"
      ><span class="block h-full rounded-full bg-accent" style="width: {pct}%"></span></span
    >
  {/if}
{/snippet}

{#snippet number(size: string, ofSize: string)}
  <span class="font-display font-bold leading-[0.85] text-accent {size}"
    >{big.value}{#if big.of !== null}<span class="text-text-faint {ofSize}"> / {big.of}</span>{/if}{#if big.caption}<span
        class="ml-2 font-sans text-small font-medium text-text-muted">{big.caption}</span
      >{/if}</span
  >
{/snippet}

{#if phone}
  <section
    aria-label={label}
    class="flex shrink-0 flex-col gap-2 rounded-panel border-2 border-accent bg-surface-active px-3.5 pt-3 pb-3.5"
  >
    <div class="flex items-center gap-2 text-caption">
      <span class="min-w-0 truncate label-caps text-text-muted">Step {i + 1} · {stepTitle(step)}</span>
      <span class="ml-auto shrink-0 text-text-dim">attempt {s.attempts} · best {s.best}</span>
    </div>
    <div class="flex items-end gap-3">
      {@render number('text-glyph', 'text-checkout')}
      <span class="ml-auto pb-1 text-right text-caption text-text-muted">{stepRule(step)}</span>
    </div>
    {@render progress(false)}
  </section>
{:else}
  <section aria-label={label} class="flex min-h-0 flex-1 flex-col gap-4 rounded-panel border-2 border-accent bg-surface-active p-5">
    <div class="flex items-center gap-2.5">
      <Avatar name={who.name} face={who.face} size={36} tone="accent" />
      <span class="min-w-0 truncate text-player-name font-semibold">{who.name}</span>
      <span
        class="ml-auto inline-flex h-6 shrink-0 items-center rounded-full border border-line-chip px-2.5 text-micro font-bold tracking-[0.1em] text-ink-2"
        >STEP {i + 1} OF {n}</span
      >
    </div>
    <div class="flex flex-col gap-0.5">
      <span class="text-caption label-caps text-text-muted">{stepTitle(step)}</span>
      {@render number('text-[clamp(72px,12vh,120px)]', 'text-[clamp(32px,5vh,50px)]')}
    </div>
    {@render progress(true)}
    <span class="text-small text-ink-2">{stepRule(step)}</span>
    <div class="mt-auto flex flex-wrap gap-x-[18px] gap-y-1 text-small text-text-muted">
      <span>Attempt <b class="text-text">{s.attempts}</b></span>
      <span>Best {step.type === 'hit' && step.inARow ? 'streak ' : ''}<b class="text-text">{s.best}</b></span>
      <span>Darts <b class="text-text">{run.darts}</b></span>
    </div>
  </section>
{/if}
