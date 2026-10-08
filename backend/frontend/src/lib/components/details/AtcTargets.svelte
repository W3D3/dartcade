<script lang="ts">
  // Target by target (ATC-Details*): darts each target took per player, coloured 1 / 2 / 3 / 4+;
  // the target the game ended on outlined; targets not reached empty; skipped by a multiplier "·".
  import type { GameDetail } from '$lib/api'
  import { hardestLine, targetGrid } from '$lib/details/atc'
  import { targetLabel } from '$lib/details/stats'

  let { detail }: { detail: GameDetail } = $props()
  const atc = $derived(detail.detail.mode === 'atc' ? detail.detail : null)
  const sequence = $derived(atc?.sequence ?? [])
  const grid = $derived(atc ? targetGrid(atc, sequence) : [])
  const nameOf = (seat: number) => detail.game.players.find(p => p.seat === seat)?.name ?? ''
  const TONE: Record<1 | 2 | 3 | 4, string> = {
    1: 'bg-accent text-accent-fg',
    2: 'bg-[#839f38] text-accent-fg',
    3: 'bg-[#556628] text-text',
    4: 'bg-[#353e1e] text-text',
  }
  const TONES: (1 | 2 | 3 | 4)[] = [1, 2, 3, 4]
  const cols = $derived(`minmax(72px, 120px) repeat(${sequence.length}, minmax(24px, 1fr))`)
</script>

{#if atc}
  <section aria-label="Target by target" class="flex flex-col gap-4 min-w-0 box-border p-4 md:p-6 card">
    <div class="flex flex-col gap-2">
      <h2 class="m-0 font-display font-bold text-[24px] md:text-[32px] leading-none uppercase">Target by target</h2>
      <p class="m-0 text-[15px] text-text-muted">How many darts each target took. {hardestLine(detail.stats.seats, nameOf)}</p>
    </div>
    <div class="overflow-x-auto">
      <div class="grid gap-1 items-center min-w-[560px]" style:grid-template-columns={cols}>
        <span></span>
        {#each sequence as t (t)}<span class="text-center text-[12px] text-text-dim">{t === 22 ? 'B' : targetLabel(t)}</span>{/each}
        {#each grid as row (row.seat)}
          <span class="text-[14px] font-semibold truncate pr-2">{nameOf(row.seat)}</span>
          {#each row.cells as c (c.target)}
            <span
              title="{targetLabel(c.target)}: {c.state === 'none'
                ? 'not reached'
                : c.skipped
                  ? 'skipped by a multiplier'
                  : c.state === 'ended'
                    ? `${c.darts} darts, not hit when the match ended`
                    : `hit with dart ${c.darts}`}"
              class="h-8 flex items-center justify-center rounded-[6px] text-[13px] font-semibold
                     {c.state === 'none'
                ? 'border border-dashed border-line-dashed'
                : c.state === 'ended'
                  ? 'border-2 border-warn text-warn'
                  : c.tone
                    ? TONE[c.tone]
                    : 'bg-surface-chip text-text-dim'}">{c.state === 'none' ? '' : c.skipped ? '·' : c.darts}</span
            >
          {/each}
        {/each}
      </div>
    </div>
    <div class="flex flex-wrap items-center gap-x-4 gap-y-2 text-[12px] text-text-muted">
      <span>Darts needed</span>
      {#each TONES as n (n)}<span class="inline-flex items-center gap-[6px]"
          ><span class="w-4 h-4 rounded-[4px] {TONE[n]}"></span>{n === 4 ? '4+' : n}</span
        >{/each}
      <span class="inline-flex items-center gap-[6px]"
        ><span class="w-4 h-4 rounded-[4px] border-2 border-warn"></span>Target when it ended</span
      >
      <span class="inline-flex items-center gap-[6px]"
        ><span class="w-4 h-4 rounded-[4px] border border-dashed border-line-dashed"></span>Not reached</span
      >
    </div>
  </section>
{/if}
