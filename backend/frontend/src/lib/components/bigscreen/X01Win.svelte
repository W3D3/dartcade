<script lang="ts">
  // The X01 match won, on the big screen (Presenter-Win-Landscape, -Party-Landscape, -Portrait, -Party-Portrait).
  import { Crown } from '@lucide/svelte'
  import type { Snapshot } from '$lib/ws'
  import type { GameDetail } from '$lib/api'
  import type { Orientation } from '$lib/bigscreen/stage'
  import { x01Win, type X01WinStanding } from '$lib/bigscreen/x01View'
  import { ordinal, plural } from '$lib/fmt'
  import Avatar from '$lib/components/Avatar.svelte'
  import BigHeader from './BigHeader.svelte'

  let {
    snapshot,
    orientation,
    countdown,
    detail = null,
  }: { snapshot: Snapshot; orientation: Orientation; countdown: string; detail?: GameDetail | null } = $props()
  const v = $derived(x01Win(snapshot, detail))
  const landscape = $derived(orientation === 'landscape')
  const second = $derived(v.standings.at(1))
  // 2nd, 1st, 3rd: the winner in the middle; the rest below as rows
  const podium = $derived([v.standings.at(1), v.standings.at(0), v.standings.at(2)].filter((s): s is X01WinStanding => s !== undefined))
  const rest = $derived(v.standings.slice(3))
  // "Board screen in 0:42": the time is picked out in bold
  const cut = $derived(countdown.lastIndexOf(' '))

  const num = 'font-display font-bold'
  const label = 'text-[24px] font-bold tracking-[0.12em] text-text-dim'
  const panel = 'rounded-[26px] border-2 border-line bg-surface-1/85'
  const podiumLook = (place: number) =>
    place === 1
      ? {
          h: landscape ? 210 : 230,
          av: landscape ? 125 : 137,
          name: 'text-[68px]',
          n: 'text-[80px] text-accent',
          box: 'border-[#3a4a20] bg-gradient-to-b from-[#25330f] to-[#151a0e]',
        }
      : {
          h: place === 2 ? (landscape ? 151 : 165) : landscape ? 109 : 119,
          av: landscape ? 100 : 110,
          name: 'text-[54px]',
          n: place === 2 ? 'text-[60px] text-text' : 'text-[60px] text-[#ffb27a]',
          box: 'border-line bg-gradient-to-b from-[#1c1e1a] to-surface-1',
        }
</script>

{#snippet who(s: X01WinStanding, size: number, winner: boolean)}
  <span
    class="relative flex-none rounded-full {winner
      ? 'shadow-[0_0_0_6px_#0b0c0a,0_0_0_10px_var(--color-accent),0_0_60px_rgb(198_242_78/0.45)]'
      : ''}"
  >
    <Avatar name={s.name} {size} tone={winner ? 'accent' : 'quiet'} />
    {#if winner}
      <span
        class="absolute left-1/2 top-[-21px] flex size-12 -translate-x-1/2 items-center justify-center rounded-full border-[5px] border-[#0b0c0a] bg-accent text-accent-fg"
        ><Crown size={24} /></span
      >
    {/if}
  </span>
{/snippet}

{#snippet sideCol(s: X01WinStanding, winner: boolean)}
  <div class="flex min-w-0 flex-1 basis-0 flex-col items-center gap-4 pt-6 text-center {winner ? '' : 'opacity-80'}">
    {@render who(s, winner ? 150 : 120, winner)}
    <span
      class="inline-flex h-[46px] items-center rounded-full px-5 text-[26px] font-extrabold tracking-[0.14em] {winner
        ? 'bg-accent text-accent-fg'
        : 'border-2 border-line-chip text-text-muted'}">{winner ? 'WINNER' : ordinal(s.place).toUpperCase()}</span
    >
    <span class="{num} whitespace-nowrap uppercase leading-[0.9] {winner ? 'text-[100px] text-text' : 'text-[84px] text-ink-3'}"
      >{s.name}</span
    >
    <span class="whitespace-nowrap text-[30px] text-text-muted">{s.avg} avg · {s.darts} darts</span>
  </div>
{/snippet}

{#snippet score(size: number)}
  <div class="flex flex-none flex-col items-center gap-2">
    <span class={label}>LEGS · FIRST TO {v.firstTo}</span>
    <span class="{num} whitespace-nowrap leading-[0.82]" style="font-size:{size}px">
      <span class="text-accent [filter:drop-shadow(0_0_24px_rgb(198_242_78/0.5))]">{v.legs[0]}</span><span class="text-line-chip">
        –
      </span><span class="text-text-dim">{v.legs[1] ?? 0}</span>
    </span>
  </div>
{/snippet}

{#snippet gameShot()}
  {#if v.gameShotText}
    <div
      class="box-border flex flex-none items-center gap-[30px] rounded-3xl border-2 border-[#3a4a20] px-9"
      style="height:{landscape ? 120 : 140}px;background:linear-gradient(90deg,#1d2a0c,#151a0e)"
    >
      <span class="flex flex-col">
        <span class="text-[28px] font-extrabold tracking-[0.14em] text-accent">GAME SHOT</span>
        <span class="whitespace-nowrap text-[28px] text-ink-2">{v.gameShotText}</span>
      </span>
      {#if v.gameShot}<span class="{num} ml-auto whitespace-nowrap text-[88px] leading-none text-accent">{v.gameShot}</span>{/if}
    </div>
  {/if}
{/snippet}

{#snippet stats()}
  <!-- every row the saved game offers: landscape adds columns to stay at two rows, and everything tightens from seven rows (landscape) or four rows per column (portrait) -->
  {@const cols = landscape ? Math.min(5, Math.max(3, Math.ceil(v.stats.length / 2))) : 2}
  {@const dense = landscape ? v.stats.length > 6 : Math.ceil(v.stats.length / 2) >= 4}
  <div
    class="box-border grid min-h-0 flex-1 content-evenly px-9 {dense ? 'gap-x-8 gap-y-2 py-4' : 'gap-x-[60px] gap-y-4 py-7'} {panel}"
    style="grid-template-columns: repeat({cols}, minmax(0, 1fr))"
  >
    <div class="col-span-full flex justify-between text-[30px] font-bold">
      <span class="text-accent">{v.standings[0].name}</span>
      <span class="self-center {label}">MATCH STATS</span>
      <span class="text-ink-3">{second?.name}</span>
    </div>
    {#each v.stats as row (row.label)}
      <div class="flex flex-col justify-center {dense ? 'gap-1' : 'gap-1.5'}">
        <span class="text-center {label}">{row.label}</span>
        <div class="flex items-end justify-between {num} leading-none {dense ? 'text-[38px]' : landscape ? 'text-[52px]' : 'text-[60px]'}">
          <span class="text-accent">{row.values[0]}</span><span class="text-ink-3">{row.values[1]}</span>
        </div>
        <div class="flex overflow-hidden rounded-md bg-line-chip {dense ? 'h-2' : 'h-3'}">
          <span class="bg-accent" style="width:{Math.round(row.share * 100)}%"></span>
        </div>
      </div>
    {/each}
  </div>
{/snippet}

{#snippet podiumView(width: number)}
  <div class="flex flex-none flex-col" style="width:{width}px">
    <div class="flex items-end gap-4">
      {#each podium as s (s.place)}
        {@const look = podiumLook(s.place)}
        <div class="flex min-w-0 flex-1 basis-0 flex-col items-center justify-end gap-3.5">
          {@render who(s, look.av, s.place === 1)}
          <span class="{num} whitespace-nowrap uppercase leading-[0.95] {look.name}">{s.name}</span>
          <span class="whitespace-nowrap text-[26px] text-text-muted">{plural(s.legs, 'leg')} · {s.avg} avg</span>
          <div
            class="box-border flex w-full justify-center rounded-t-[22px] border-2 border-b-0 pt-3.5 {look.box}"
            style="height:{look.h}px"
          >
            <span class="{num} leading-none {look.n}">{s.place}</span>
          </div>
        </div>
      {/each}
    </div>
    {#each rest as s (s.place)}
      <div
        class="box-border flex h-[84px] flex-none items-center gap-5 border-2 border-line bg-surface-1 px-[26px] {s === rest.at(-1)
          ? 'rounded-b-[22px]'
          : ''}"
      >
        <span class="{num} text-[44px] text-text-dim">{ordinal(s.place).toUpperCase()}</span>
        <Avatar name={s.name} size={52} tone="quiet" />
        <span class="text-[34px] font-bold">{s.name}</span>
        <span class="ml-auto whitespace-nowrap text-[26px] text-text-muted">{plural(s.legs, 'leg')} · {s.avg} avg</span>
      </div>
    {/each}
  </div>
{/snippet}

{#snippet table()}
  <div class="box-border flex flex-col gap-1.5 px-[30px] py-[22px] {panel}">
    <div class="grid grid-cols-[90px_1fr_90px_120px_130px] items-center gap-2.5 {label}">
      <span></span><span>PLAYER</span><span class="text-right">LEGS</span><span class="text-right">AVG</span><span class="text-right"
        >FIRST 9</span
      >
    </div>
    {#each v.standings as s, i (i)}
      <div class="grid grid-cols-[90px_1fr_90px_120px_130px] items-center gap-2.5 border-t-2 border-[#22251f] py-2 {num}">
        <span class="text-[42px] {s.place === 1 ? 'text-accent' : 'text-text-dim'}">{ordinal(s.place).toUpperCase()}</span>
        <span class="truncate font-sans text-[32px]">{s.name}</span>
        <span class="text-right text-[42px]">{s.legs}</span>
        <span class="text-right text-[42px]">{s.avg}</span>
        <span class="text-right text-[42px] text-text-muted">{s.firstNine}</span>
      </div>
    {/each}
  </div>
{/snippet}

<div
  class="flex size-full flex-col overflow-hidden bg-bg-deep"
  style="background-image:radial-gradient(1300px 700px at 50% 30%,#1a2210,#0b0c0a 70%)"
>
  <BigHeader title={v.header.title} meta={landscape ? v.header.meta : v.header.meta.split(' · ').slice(-1).join('')} board={v.header.board}>
    {#snippet badge()}
      <span
        class="inline-flex h-11 items-center whitespace-nowrap rounded-full bg-accent px-[18px] text-[24px] font-extrabold tracking-[0.14em] text-accent-fg"
        >MATCH OVER</span
      >
    {/snippet}
  </BigHeader>

  <main class="box-border flex min-h-0 flex-1 flex-col gap-5 {landscape ? 'px-[44px] py-6' : 'px-10 py-[30px]'}">
    {#if v.party}
      <div class="flex flex-none flex-col items-center gap-1.5 text-center">
        <span class="text-[28px] font-extrabold tracking-[0.16em] text-accent">{v.kicker}</span>
        <span class="{num} uppercase leading-[0.9] tracking-[0.01em] {landscape ? 'text-[120px]' : 'text-[124px]'}"
          >{v.winner.name} WINS</span
        >
        {#if v.note}<span class="text-[30px] text-text-muted">{v.note}</span>{/if}
      </div>
      {#if landscape}
        <div class="flex min-h-0 flex-1 items-end gap-11">
          {@render podiumView(960)}
          <div class="flex min-w-0 flex-1 flex-col gap-4">{@render table()}</div>
        </div>
      {:else}
        <div class="mt-2.5 flex flex-none justify-center">{@render podiumView(1000)}</div>
        {@render table()}
      {/if}
    {:else}
      {#if landscape}
        <div class="flex h-[356px] flex-none items-center gap-[30px]">
          {@render sideCol(v.standings[0], true)}
          {@render score(250)}
          {#if second}{@render sideCol(second, false)}{/if}
        </div>
      {:else}
        <div class="flex flex-none flex-col items-center gap-[30px]">
          {@render sideCol(v.standings[0], true)}
          {@render score(300)}
          {#if second}
            <div class="flex items-center gap-6 opacity-85">
              <Avatar name={second.name} size={80} tone="quiet" />
              <span class="flex flex-col">
                <span class="{num} text-[64px] uppercase leading-none text-ink-3">{second.name}</span>
                <span class="text-[28px] text-text-muted">{ordinal(second.place)} · {second.avg} avg · {second.darts} darts</span>
              </span>
            </div>
          {/if}
        </div>
      {/if}
      {@render gameShot()}
      {#if v.stats.length}{@render stats()}{/if}
    {/if}
  </main>

  <div class="flex h-24 flex-none items-center gap-[30px] border-t-2 border-[#1f221c] {landscape ? 'px-[44px]' : 'px-10'}">
    <span class="whitespace-nowrap text-[28px] text-text-muted"
      >Saved to History{landscape ? (v.party ? ' · counts in everyone’s stats' : ' · counts in stats') : ''}</span
    >
    <span class="ml-auto whitespace-nowrap text-[28px] text-ink-2">
      {cut > 0 ? countdown.slice(0, cut + 1) : countdown}{#if cut > 0}<b class="{num} text-[38px] text-text">{countdown.slice(cut + 1)}</b
        >{/if}
    </span>
  </div>
</div>
