<!--
  One player on the match screen in any layout: a duel panel, a party row, or the phone's thrower card
  and compact row. Each shows the total and the round-by-round scores.
-->
<script lang="ts">
  import type { Who } from '$lib/face'
  import type { ShanghaiGame } from '$lib/api/game-ws'
  import Avatar from '$lib/components/Avatar.svelte'
  import PanelShell from '$lib/components/PanelShell.svelte'
  import PhoneCardShell from '$lib/components/PhoneCardShell.svelte'
  import RowShell from '$lib/components/RowShell.svelte'
  import ShanghaiRounds from '$lib/components/shanghai/ShanghaiRounds.svelte'
  import { playerCard } from '$lib/playerCard'
  import { plural } from '$lib/fmt'

  let {
    game,
    seat,
    who,
    active,
    upNext,
    variant,
  }: { game: ShanghaiGame; seat: number; who: Who; active: boolean; upNext: boolean; variant: 'panel' | 'row' | 'phone' } = $props()

  const s = $derived(game.seats[seat])
  const sideLine = $derived(game.contenders?.includes(seat) ? 'In sudden death' : null)
  const pill = $derived(active ? 'throwing' : upNext ? 'up-next' : null)
  const label = $derived(`${who.name}, ${active ? 'throwing' : upNext ? 'up next' : 'waiting'}, ${plural(s.score, 'point')}`)
</script>

{#snippet total(size: string)}
  <span class="flex items-baseline gap-2">
    <span class="font-display font-bold leading-none {size} {active ? 'text-accent' : ''}">{s.score}</span>
    <span class="text-small label-caps text-text-muted">{sideLine ?? 'points'}</span>
  </span>
{/snippet}

{#if variant === 'panel'}
  <PanelShell {who} {active} {pill} {label} class="min-w-[220px]">
    {@render total('text-6xl xl:text-7xl')}
    <ShanghaiRounds {game} {seat} current={active} />
  </PanelShell>
{:else if variant === 'row'}
  <RowShell
    {who}
    {active}
    {pill}
    {label}
    class="py-4 grid-cols-[minmax(0,160px)_auto_minmax(0,1fr)] xl:grid-cols-[200px_120px_minmax(0,1fr)]"
  >
    {@render total('text-4xl xl:text-5xl')}
    <ShanghaiRounds {game} {seat} current={active} compact />
  </RowShell>
{:else if active}
  <PhoneCardShell {who} {label} {pill} seat={null} class="gap-[10px]">
    {#snippet aside()}<span class="ml-auto font-display font-bold text-3xl leading-none text-accent">{s.score}</span>{/snippet}
    <ShanghaiRounds {game} {seat} current compact />
  </PhoneCardShell>
{:else}
  <section
    aria-label={label}
    class="shrink-0 h-[58px] box-border px-[14px] rounded-lg flex items-center gap-[10px] {playerCard(false, null)}"
  >
    <Avatar name={who.name} face={who.face} size={32} />
    <span class="flex flex-col gap-[2px] min-w-0">
      <span class="text-sm font-semibold text-ink-2 truncate">{who.name}</span>
      <span class="text-caption text-text-dim truncate">{upNext ? 'Up next' : (sideLine ?? '')}</span>
    </span>
    <span class="ml-auto font-display font-bold text-2xl leading-none shrink-0">{s.score}</span>
  </section>
{/if}
