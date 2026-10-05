<script lang="ts">
  // Frame of a stacked player row (3 or more players): the card, and its first column with the
  // avatar, name (and board in remote games) and pill. The game's columns go in `children`.
  import type { Snippet } from 'svelte'
  import Avatar from './Avatar.svelte'
  import PlayerName from './PlayerName.svelte'
  import PlayerPill from './PlayerPill.svelte'
  import type { PillKind } from './pills.js'
  import type { SeatLine } from '$lib/remote'
  import { playerCard } from '$lib/playerCard'

  let {
    name,
    active,
    pill,
    seat = null,
    class: className,
    children,
  }: {
    name: string
    active: boolean
    pill: PillKind | null
    seat?: SeatLine | null
    /** The row's grid columns and vertical padding. */
    class: string
    children: Snippet
  } = $props()
</script>

<div class="@container h-full min-h-0">
  <section
    aria-label="{name}, {active ? 'throwing' : 'waiting'}"
    class="h-full min-h-0 box-border rounded-[16px] px-[18px] gap-4 xl:px-6 xl:gap-5 grid items-center max-xl:content-center overflow-hidden
         {className} {playerCard(active)}"
  >
    <div class="flex flex-col gap-[10px] min-w-0">
      <span class="flex items-center gap-[10px] xl:gap-3 min-w-0">
        <Avatar {name} tone={active ? 'accent' : 'default'} class="w-[34px] h-[34px] text-[14px] xl:w-10 xl:h-10 xl:text-[17px]" />
        <PlayerName
          {name}
          {seat}
          nameClass="text-[18px] xl:text-[21px] {active ? 'text-text' : 'text-ink-2'}"
          youClass="text-[13px]"
          gap="gap-[2px]"
        />
      </span>
      {#if pill}<PlayerPill kind={pill} small />{/if}
    </div>
    {@render children()}
  </section>
</div>
