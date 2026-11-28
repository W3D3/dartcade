<script lang="ts">
  // The visit damage popup (Dungeon-Pixel-Damage, -Damage-Phone; the Fire levels artboard for the
  // Visit card): one row per dart, BASE × MULT = DAMAGE, with each trigger popping in as a chip and
  // its box rumbling past a big number; then the after-visit chips and the Final damage card, which
  // burns past half, three quarters and all of the front enemy's HP. It shows `popup`, the trace
  // played so far (lib/dungeon/popup.ts); the screen plays it. `compact` is the phone's.
  import { ArrowUp, Ban, Check, Shield, Sparkles, Swords } from '@lucide/svelte'
  import { chipOf, RUMBLE_OVER, rumble, type Popup } from '$lib/dungeon/popup'
  import type { DungeonTraceStep } from '$lib/api/game-ws'
  import PixelSprite from './PixelSprite.svelte'

  let { popup, thrower, target, compact = false }: { popup: Popup; thrower: string; target: string; compact?: boolean } = $props()

  const BOX = {
    base: { label: 'Base', line: '#5aa0e8', fill: '#162a44', ink: '#cfe4ff', dim: '#2f4a6e' },
    mult: { label: 'Mult', line: '#ff6a5e', fill: '#3a1618', ink: '#ffd2cc', dim: '#6e2f2f' },
    damage: { label: 'Damage', line: '#f2c14e', fill: '#3a2f12', ink: '#f2c14e', dim: '#6a5418' },
  } as const
  // A chip that isn't an artifact (drawn as its sprite) shows a line icon for its source
  const SOURCE_ICON = {
    dart: Sparkles,
    segment: ArrowUp,
    artifact: Sparkles,
    class: Swords,
    weakness: ArrowUp,
    resist: Shield,
    immune: Ban,
    afterVisit: Sparkles,
  } as const
  const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1))
  const FIRE_TOP = ['h-0', 'h-4', 'h-8', 'h-12'] as const
  const RUMBLE = ['', 'motion-safe:animate-rumble-1', 'motion-safe:animate-rumble-2', 'motion-safe:animate-rumble-3'] as const
</script>

{#snippet box(kind: keyof typeof BOX, value: number | null, landed: boolean)}
  {@const b = BOX[kind]}
  <div
    class="relative shrink-0 overflow-hidden border-3 {compact ? 'h-[90px] w-[78px] rounded-xl' : 'h-24 w-[118px] rounded-card'}"
    style="border-color: {b.line}; background: {b.fill}; opacity: {landed ? 1 : 0.45}"
  >
    <span class="absolute inset-x-0 top-1.5 text-center font-display text-base font-bold tracking-wide uppercase" style:color={b.line}
      >{b.label}</span
    >
    {#key value}
      <span
        class="absolute inset-x-0 top-[18px] bottom-0 flex items-center justify-center font-display leading-none font-bold [text-shadow:0_3px_0_#0e0a14] {compact
          ? 'text-4xl'
          : 'text-6xl'} {RUMBLE[rumble(value, RUMBLE_OVER[kind])]}"
        style:color={value === null ? b.dim : b.ink}>{value === null ? '–' : fmt(value)}</span
      >
    {/key}
  </div>
{/snippet}

{#snippet chip(step: DungeonTraceStep)}
  {@const c = chipOf(step)}
  <span
    class="inline-flex h-[34px] shrink-0 animate-pop-in items-center gap-1.5 rounded-key border-2 bg-[#0e0a14] pr-2 pl-1 whitespace-nowrap motion-reduce:animate-none"
    style:border-color={c.colour}
    title="{c.name}: {c.change} {c.unit || (step.effect === 'base_add' ? 'Base' : 'Mult')}"
    aria-label="{c.name}: {c.change} {c.unit || (step.effect === 'base_add' ? 'Base' : 'Mult')}"
    data-testid="popup-chip"
  >
    {#if c.artifact}<PixelSprite id={c.artifact} scale={1.5} />{:else}{@const Icon = SOURCE_ICON[step.source]}<Icon
        class="ml-1 size-4"
        style="color: {c.colour}"
        aria-hidden="true"
      />{/if}
    {#if !compact}<span class="text-sm">{c.name}</span>{/if}
    <span class="font-display text-lg font-bold" style:color={c.tone}
      >{c.change}{#if c.unit}<span class="ml-0.5 text-xs tracking-wider uppercase">{c.unit}</span>{/if}</span
    >
  </span>
{/snippet}

<div
  class="relative flex flex-col gap-3 rounded-xl border-2 border-dg-gold bg-[#1b1523] shadow-[0_18px_50px_rgba(0,0,0,0.6)] {compact
    ? 'p-3'
    : 'p-4'}"
  role="group"
  aria-label="{thrower}'s visit: {popup.total} damage"
  data-testid="damage-popup"
>
  <div class="flex items-baseline gap-2.5">
    <span class="font-display text-lg font-bold tracking-wide text-dg-gold uppercase">{thrower}’s visit</span>
    <span class="ml-auto truncate text-sm text-dg-muted">on {target}</span>
  </div>

  {#each popup.rows as row, i (i)}
    {@const landed = row.base !== null}
    <div class="flex min-w-0 items-center gap-x-3 gap-y-2 {compact ? 'flex-wrap' : ''}" data-testid="popup-row">
      <div class="flex shrink-0 items-center gap-1">
        <span class="flex shrink-0 flex-col items-center gap-0.5 {compact ? 'w-12' : 'w-16'} {landed ? '' : 'opacity-45'}">
          <span class="font-display text-sm font-bold tracking-wide text-dg-muted uppercase">Dart {i + 1}</span>
          <span class="font-display font-bold {compact ? 'text-2xl' : 'text-3xl'}">{row.label}</span>
        </span>
        {@render box('base', row.base, landed)}
        <span class="w-5 text-center font-display text-3xl leading-none font-bold text-dg-gold" aria-hidden="true">×</span>
        {@render box('mult', row.mult, landed)}
        <span class="w-5 text-center font-display text-3xl leading-none font-bold text-dg-gold" aria-hidden="true">=</span>
        {@render box('damage', row.damage, landed)}
      </div>
      {#if row.chips.length}
        <div class="flex min-w-0 flex-wrap gap-1.5">
          {#each row.chips as s, k (k)}{@render chip(s)}{/each}
        </div>
      {/if}
    </div>
  {/each}

  <div class="flex flex-wrap items-end gap-4 border-t border-dg-line pt-3">
    <div class="flex min-w-0 flex-1 flex-col gap-2">
      <span class="flex items-center gap-2 font-display text-sm font-bold tracking-wide text-dg-gold uppercase">
        <Check class="size-4" aria-hidden="true" />After the visit<span class="h-px flex-1 bg-dg-line"></span>
      </span>
      {#if popup.after.length}
        <div class="flex flex-wrap gap-1.5">
          {#each popup.after as s, k (k)}{@render chip(s)}{/each}
        </div>
      {/if}
      {#if !compact}
        <span class="text-sm text-dg-muted">
          The total ticks up with every dart. It catches fire past half the enemy’s health, burns hotter past 75% and blazes on a kill.
        </span>
      {/if}
    </div>
    <div class="relative {compact ? 'w-40' : 'w-[260px]'}" data-fire={popup.fire} data-testid="final-damage">
      {#if popup.fire > 0}
        <span
          aria-hidden="true"
          class="absolute inset-x-1 -top-1 origin-bottom -translate-y-full animate-flicker rounded-t-full bg-[radial-gradient(ellipse_at_50%_100%,#ffd36a_0%,#ff7a2a_35%,rgba(255,60,16,0.5)_60%,transparent_75%)] blur-[1px] motion-reduce:animate-none {FIRE_TOP[
            popup.fire
          ]}"
        ></span>
      {/if}
      <div
        class="relative flex flex-col items-center justify-center gap-1 overflow-hidden rounded-card border-3 border-dg-gold bg-[#2a2010] {compact
          ? 'h-24'
          : 'h-[124px]'} {popup.fire === 3
          ? 'shadow-[0_0_28px_8px_rgba(255,80,20,0.65)]'
          : popup.fire === 2
            ? 'shadow-[0_0_18px_4px_rgba(255,80,20,0.5)]'
            : popup.fire === 1
              ? 'shadow-[0_0_10px_2px_rgba(255,80,20,0.4)]'
              : ''}"
      >
        {#if popup.fire > 0}
          <span
            aria-hidden="true"
            class="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_-10%,rgba(255,90,31,0.8),rgba(255,60,16,0.28)_55%,transparent_85%)]"
            style:opacity={popup.fire / 3}
          ></span>
        {/if}
        <span class="relative font-display text-base font-bold tracking-wide text-dg-gold uppercase">Final damage</span>
        {#key popup.total}
          <span
            class="relative font-display leading-none font-bold [text-shadow:0_3px_0_#0e0a14] {compact
              ? 'text-5xl'
              : 'text-6xl'} {popup.fire ? 'text-[#ffb347]' : 'text-dg-text'}"
            role="status">{popup.total}</span
          >
        {/key}
      </div>
    </div>
  </div>
</div>
