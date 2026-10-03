<script lang="ts">
  // A waiting player on a phone: avatar, name, a short line (up next, can finish), leg pips, the number that matters.
  import LegPips from './LegPips.svelte'
  import PlayerPill from './PlayerPill.svelte'
  import RollingNumber from './RollingNumber.svelte'
  import type { RollOptions } from '$lib/rollingNumber'
  import type { PillKind } from './pills.js'

  let { name, pill, sub, value, valueLabel, legs, active = false, you = false, roll = {} }: {
    name: string
    pill: PillKind | null
    sub: string
    value: string
    valueLabel: string
    legs?: { total: number; won: number }
    /** The thrower, collapsed to a row (phone keypad mode). */
    active?: boolean
    /** The viewer's own seat (remote games). */
    you?: boolean
    /** How the value rolls when it changes. */
    roll?: RollOptions
  } = $props()

  const initial = $derived(name.trim().charAt(0).toUpperCase() || '?')
</script>

<section aria-label="{name}, {sub}, {valueLabel} {value}"
  class="shrink-0 h-[58px] box-border px-[14px] flex items-center gap-[10px] rounded-[12px] {active ? 'bg-surface-active border-2 border-accent' : 'bg-surface-panel border border-line-2'}">
  <span class="w-8 h-8 shrink-0 rounded-full flex items-center justify-center font-bold text-[13px] {active ? 'bg-accent text-accent-fg' : 'bg-line-chip text-text'}">{initial}</span>
  <span class="flex flex-col gap-[2px] min-w-0">
    <span class="text-[15px] font-semibold truncate {active ? 'text-text' : 'text-ink-2'}">{name}{#if you}<span class="text-[12px] font-medium text-accent"> · you</span>{/if}</span>
    <span class="text-[12px] text-text-dim truncate">{sub}</span>
  </span>
  {#if pill === 'winner' || pill === 'leading' || (active && pill)}<PlayerPill kind={pill} small />{/if}
  {#if legs && legs.total > 1}<LegPips total={legs.total} won={legs.won} active={false} />{/if}
  <span class="ml-auto flex flex-col items-end shrink-0">
    <span class="text-[10px] tracking-[0.1em] uppercase text-text-dim">{valueLabel}</span>
    <span class="font-display font-bold text-[32px] leading-[0.9] tabular-nums {active ? 'text-text' : 'text-ink-3'}"><RollingNumber {value} {...roll} /></span>
  </span>
</section>
