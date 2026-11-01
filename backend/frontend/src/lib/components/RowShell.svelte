<script lang="ts">
  import type { Who } from '$lib/face'
  // Frame of a stacked player row (3 or more players): the card, and its first column with the
  // avatar, name (and board in remote games) and pill. The game's columns go in `children`.
  import type { Snippet } from 'svelte'
  import Avatar from './Avatar.svelte'
  import PlayerName from './PlayerName.svelte'
  import PlayerPill from './PlayerPill.svelte'
  import type { PillKind } from './pills.js'
  import type { SeatLine } from '$lib/remote'
  import { nameTone, playerCard, type CardTone } from '$lib/playerCard'

  let {
    who,
    active,
    pill,
    seat = null,
    class: className,
    children,
    tone = null,
    label,
    pillLabel,
  }: {
    who: Who
    active: boolean
    pill: PillKind | null
    seat?: SeatLine | null
    /** The row's grid columns and vertical padding. */
    class: string
    children: Snippet
    /** A state beyond throwing or waiting (a Higher Lower life just lost, out of the game). */
    tone?: CardTone
    /** The row's accessible name, when the game says more than throwing or waiting. */
    label?: string
    /** The pill's text, when it differs from its kind's ("Out · 2nd"). */
    pillLabel?: string
  } = $props()
  const name = $derived(who.name)
</script>

<div class="@container h-full min-h-0">
  <section
    aria-label={label ?? `${name}, ${active ? 'throwing' : 'waiting'}`}
    class="h-full min-h-0 box-border rounded-[16px] px-[18px] gap-4 xl:px-6 xl:gap-5 grid items-center max-xl:content-center overflow-hidden
         {className} {playerCard(active, tone)}"
  >
    <div class="flex flex-col gap-[10px] min-w-0">
      <span class="flex items-center gap-[10px] xl:gap-3 min-w-0">
        <Avatar
          name={who.name}
          bot={who.bot}
          face={who.face}
          tone={active ? 'accent' : 'default'}
          class="w-[34px] h-[34px] text-[14px] xl:w-10 xl:h-10 xl:text-[17px] {tone === 'out' ? 'opacity-50' : ''}"
        />
        <PlayerName {name} {seat} nameClass="text-[18px] xl:text-[21px] {nameTone(active, tone)}" youClass="text-[13px]" gap="gap-[2px]" />
      </span>
      {#if pill}<PlayerPill kind={pill} small label={pillLabel} />{/if}
    </div>
    {@render children()}
  </section>
</div>
