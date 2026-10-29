<!--
  The Cricket marks table, the hero of the match screen. Two sides read like a chalkboard
  (player | target | player, Cricket-Duel, Mobile-Cricket); a party puts the targets first, then a
  column per player with their card as its head (Cricket-Party). A side that opened a target it
  can still score on is filled lime; a row every side opened is grey and says Closed, fading
  there once the closing mark has drawn in.
-->
<script lang="ts">
  import type { CricketGame } from '$lib/api/game-ws'
  import CricketPanel from '$lib/components/cricket/CricketPanel.svelte'
  import Mark from '$lib/components/cricket/Mark.svelte'
  import { legNumber, targetLabel, type CricketSide } from '$lib/cricket/view'

  let {
    game,
    sides,
    from,
    variant,
  }: {
    game: CricketGame
    sides: CricketSide[]
    /** Per seat and target, the marks before the last dart (see markDeltas). */
    from: number[][]
    variant: 'duel' | 'party' | 'phone'
  } = $props()

  const cp = $derived(game.currentPlayer)
  const chalk = $derived(sides.length === 2 && variant !== 'party')
  const phone = $derived(variant === 'phone')
  const isUp = (s: CricketSide) => s.seats.includes(cp)
  const cellLabel = (m: number, closed: boolean) =>
    closed ? 'closed' : m >= 3 ? 'opened, can score' : m === 0 ? 'no marks' : m === 1 ? '1 mark' : `${m} marks`
  // Closed rows fade to grey after the closing circle has drawn; nothing fades back
  const fade = 'motion-safe:transition-colors motion-safe:duration-[400ms] motion-safe:delay-[400ms]'
  // A closed row is struck through edge to edge: each cell draws its piece of one grey line, over its marks
  const strike =
    "relative after:content-[''] after:absolute after:inset-x-0 after:top-1/2 after:h-[3px] after:-translate-y-1/2 after:bg-text-dim after:pointer-events-none"
  const caption = $derived(`Marks${phone ? '' : ` · Leg ${legNumber(game)}`} · Round ${game.round}`)
  // The rows' least height; on larger screens the table stretches them to fill its card
  const rowH = $derived(phone ? 'h-9' : 'h-[clamp(32px,4.5vh,60px)]')
</script>

{#snippet head(s: CricketSide)}
  <th scope="col" class="{phone ? 'px-1 pb-[6px]' : 'px-2 pb-3'} font-normal align-bottom">
    {#if variant === 'party'}
      <CricketPanel {game} side={s} active={isUp(s)} upNext={!isUp(s) && s.seats.includes(game.nextPlayer ?? -1)} size="head" />
    {:else}
      <span
        class="inline-flex items-center gap-[10px] font-semibold {phone ? 'pb-1 text-[14px]' : 'pb-2 text-[24px]'} {isUp(s)
          ? `text-text ${phone ? 'shadow-[inset_0_-2px_0_var(--color-accent)]' : 'shadow-[inset_0_-3px_0_var(--color-accent)]'}`
          : 'text-ink-2'}"
      >
        {#if isUp(s) && !phone}<span aria-hidden="true" class="w-[10px] h-[10px] rounded-full bg-accent"></span>{/if}{s.name}
      </span>
    {/if}
  </th>
{/snippet}

{#snippet target(i: number)}
  {@const closed = game.closed[i]}
  <th
    scope="row"
    class="border-t border-line font-bold {phone ? 'px-1 py-[3px]' : 'px-2 xl:px-4 py-1'} {closed
      ? `text-text-dim ${fade} ${strike}`
      : 'text-text'}"
  >
    <span
      class="flex flex-col gap-[2px] font-display leading-[0.95] uppercase {chalk ? 'items-center' : 'items-start'} {phone
        ? 'text-[28px]'
        : 'text-[clamp(28px,5vh,54px)]'}"
      >{targetLabel(game.targets[i])}{#if closed}<span
          class="font-sans font-semibold tracking-[0.1em] {phone ? 'text-[10px]' : 'text-[11px] xl:text-[12px]'}">Closed</span
        >{/if}</span
    >
  </th>
{/snippet}

{#snippet cell(s: CricketSide, i: number)}
  {@const m = game.marks[s.seat][i]}
  {@const closed = game.closed[i]}
  {@const score = !closed && m >= 3}
  <td
    aria-label="{s.name}, {targetLabel(game.targets[i])}: {cellLabel(m, closed)}"
    class="border-t border-line {phone ? 'px-1 py-[3px]' : 'px-2 xl:px-3 py-1'} {closed ? `text-text-dim ${fade} ${strike}` : 'text-text'}"
  >
    <div
      class="flex items-center justify-center mx-auto {rowH} {closed ? fade : ''} {score
        ? `w-full ${phone ? 'max-w-[100px]' : 'max-w-[230px]'} rounded-[12px] bg-accent text-accent-fg`
        : ''}"
    >
      {#if m > 0}<Mark marks={m} from={from[s.seat]?.[i] ?? m} class="h-[86%] w-auto aspect-square" />{/if}
    </div>
  </td>
{/snippet}

<!-- The visible caption sits outside the table, so the table can stretch its rows to fill the card -->
<div class="flex flex-col {phone ? '' : 'h-full'}">
  <div aria-hidden="true" class="shrink-0 flex items-center justify-between gap-6 {phone ? 'px-[2px] pb-2' : 'pb-[14px]'}">
    <span class="{phone ? 'text-[11px]' : 'text-[13px]'} label-caps text-text-dim">{caption}</span>
    <span class="flex items-center gap-3 xl:gap-[18px] {phone ? 'text-[12px]' : 'text-[13px]'} text-text-muted">
      <span class="inline-flex items-center gap-[7px]"><span class="w-[14px] h-[14px] rounded-[4px] bg-accent"></span>Can score</span>
      <span class="inline-flex items-center gap-[7px]"
        ><span class="w-[14px] h-[14px] box-border rounded-[4px] border-[1.5px] border-line-pip"></span>Closed</span
      >
    </span>
  </div>
  <table class="w-full {phone ? '' : 'flex-1'} border-collapse table-fixed">
    <caption class="sr-only">{caption}</caption>
    <colgroup>
      {#if chalk}
        <col /><col class={phone ? 'w-[86px]' : 'w-[120px] xl:w-[200px]'} /><col />
      {:else}
        <col class={phone ? 'w-[64px]' : 'w-[96px] xl:w-[128px]'} />{#each sides as s (s.seat)}<col />{/each}
      {/if}
    </colgroup>
    <thead>
      <tr>
        {#if chalk}
          {@render head(sides[0])}
          <th scope="col" class="px-2 {phone ? 'pb-[6px]' : 'pb-3'} text-[12px] font-normal label-caps text-text-dim align-bottom"
            ><span class={phone ? 'sr-only' : ''}>Target</span></th
          >
          {@render head(sides[1])}
        {:else}
          <th scope="col" class="px-2 xl:px-4 pb-3 text-left text-[12px] font-normal label-caps text-text-dim align-bottom">Target</th>
          {#each sides as s (s.seat)}{@render head(s)}{/each}
        {/if}
      </tr>
    </thead>
    <tbody>
      {#each game.targets as _, i (i)}
        <tr>
          {#if chalk}
            {@render cell(sides[0], i)}{@render target(i)}{@render cell(sides[1], i)}
          {:else}
            {@render target(i)}{#each sides as s (s.seat)}{@render cell(s, i)}{/each}
          {/if}
        </tr>
      {/each}
    </tbody>
  </table>
</div>
