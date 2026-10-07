<script lang="ts">
  // A waiting player on a phone: avatar, name, a short line (up next, can finish), leg pips, the number that matters.
  import Avatar from './Avatar.svelte'
  import LegPips from './LegPips.svelte'
  import PlayerName from './PlayerName.svelte'
  import PlayerPill from './PlayerPill.svelte'
  import RollingNumber from './RollingNumber.svelte'
  import type { RollOptions } from '$lib/rollingNumber'
  import type { PillKind } from './pills.js'
  import { playerCard } from '$lib/playerCard'

  let {
    name,
    bot = null,
    pill,
    sub,
    value,
    valueLabel,
    legs,
    active = false,
    you = false,
    roll = {},
  }: {
    name: string
    /** A bot seat: shows a robot glyph coloured by level instead of the name's initial. */
    bot?: { level: number } | null
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
</script>

<section
  aria-label="{name}, {sub}, {valueLabel} {value}"
  class="shrink-0 h-[58px] box-border px-[14px] flex items-center gap-[10px] rounded-[12px] {playerCard(active)}"
>
  <Avatar {name} {bot} tone={active ? 'accent' : 'default'} size={32} />
  <PlayerName {name} {you} nameClass="text-[15px] {active ? 'text-text' : 'text-ink-2'}" youClass="text-[12px]" gap="gap-[2px]" leading="">
    {#snippet below()}<span class="text-[12px] text-text-dim truncate">{sub}</span>{/snippet}
  </PlayerName>
  {#if pill === 'winner' || pill === 'leading' || (active && pill)}<PlayerPill kind={pill} small />{/if}
  {#if legs && legs.total > 1}<LegPips total={legs.total} won={legs.won} active={false} />{/if}
  <span class="ml-auto flex flex-col items-end shrink-0">
    <span class="text-[10px] label-caps text-text-dim">{valueLabel}</span>
    <span class="font-display font-bold text-[32px] leading-[0.9] tabular-nums {active ? 'text-text' : 'text-ink-3'}"
      ><RollingNumber {value} {...roll} /></span
    >
  </span>
</section>
