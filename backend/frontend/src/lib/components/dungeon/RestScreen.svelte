<script lang="ts">
  // A rest room (Dungeon-Pixel-Rest, -Rest-Phone): each living hero in turn throws one visit and heals by
  // its score, up to their max HP. The party sits at a campfire; each hero's card shows their HP, the heal
  // coming (striped) and who is done. The board takes the darts as in a fight.
  import type { DungeonGame } from '$lib/api/game-ws'
  import type { MatchControls } from '$lib/components/match/types'
  import { CLASSES } from '$shared/dungeon/content/classes'
  import { classOf } from '$lib/dungeon/view'
  import HpBar from './HpBar.svelte'
  import RoomStage from './RoomStage.svelte'
  import VisitPanel from './VisitPanel.svelte'

  let { game, names, ...controls }: MatchControls & { game: DungeonGame; names: string[] } = $props()

  const hero = $derived(game.heroes[game.currentPlayer])
  const darts = $derived(game.currentVisitDarts)
  const score = $derived(darts.reduce((n, d) => n + d.score, 0))
  const heal = $derived(Math.min(hero.maxHp - hero.hp, score))
  const living = $derived(game.heroes.filter(h => h.hp > 0))
  // Heroes throw in seat order, so the lower seats have thrown
  const doneSeat = (seat: number) => seat < game.currentPlayer
</script>

<main
  class="flex h-full flex-col gap-3 overflow-y-auto bg-dg-bg p-3 text-dg-text md:p-5 lg:grid lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)] lg:gap-x-3.5 lg:overflow-hidden"
  data-testid="dungeon-rest"
>
  <div class="flex flex-col gap-3.5 lg:min-h-0">
    <header class="flex flex-col gap-1.5">
      <h2 class="font-display text-2xl font-bold uppercase tracking-wider text-dg-gold md:text-3xl">Rest site</h2>
      <p class="text-sm text-dg-muted">Each hero throws one visit and heals by its score, up to full HP. Artifacts do not trigger here.</p>
    </header>
    <RoomStage
      class="h-[220px] shrink-0 md:h-[320px] lg:h-auto lg:min-h-[260px] lg:flex-1"
      label="Rest site: the party sits around a campfire"
      heroes={game.heroes}
      prop="campfire"
      propScale={1.25}
      glow="255,140,40"
    />
    <ul class="flex shrink-0 gap-2 p-0 md:gap-3" aria-label="Party">
      {#each living as h (h.seat)}
        {@const now = h.seat === game.currentPlayer}
        {@const done = doneSeat(h.seat)}
        {@const cls = classOf(h)}
        {@const gain = now ? heal : 0}
        <li
          data-testid="hero"
          aria-label="{names[h.seat]}: {h.hp} to {h.hp + gain} of {h.maxHp} HP"
          class="flex min-w-0 flex-1 flex-col gap-2 rounded-xl bg-dg-panel p-2.5 md:p-3 md:px-3.5 {now
            ? 'border-2 border-dg-gold'
            : 'border border-dg-line'}"
        >
          <div class="flex items-center justify-between gap-2">
            <span class="truncate font-display text-base font-bold uppercase tracking-wider">{names[h.seat]}</span>
            <span class="font-display text-xs font-bold uppercase tracking-wider {now ? 'text-dg-gold' : 'text-dg-muted'}"
              >{now ? 'Throwing' : done ? 'Done' : 'Waiting'}</span
            >
          </div>
          <div class="flex items-baseline justify-end gap-2 text-sm text-dg-muted md:justify-between">
            <span class="max-md:hidden">{cls ? CLASSES[cls].name : ''}</span>
            <span class="inline-flex items-baseline gap-1.5">
              {#if gain > 0}<span>{h.hp}</span><span aria-hidden="true">→</span>{/if}
              <span class="text-base text-dg-text">{h.hp + gain}/{h.maxHp}</span>
            </span>
          </div>
          <HpBar hp={h.hp} maxHp={h.maxHp} {gain} tall />
          <span class="min-h-5 text-sm text-dg-heal md:text-sm">
            {#if now}{#if darts.length}{score} so far · +{heal} HP{heal === h.maxHp - h.hp ? ', full' : ''}{:else}Throw to heal{/if}
            {:else if game.lastHeal?.seat === h.seat}<span data-testid="last-heal">Healed +{game.lastHeal.amount} HP</span>{/if}
          </span>
        </li>
      {/each}
    </ul>
  </div>
  <div class="flex flex-col gap-3 lg:min-h-0 lg:overflow-y-auto">
    <div class="flex items-baseline justify-between gap-2">
      <h3 class="font-display text-xl font-bold uppercase tracking-wider text-dg-gold">{names[game.currentPlayer]} throws · Heal</h3>
      <span class="text-sm text-dg-muted">Any segment counts</span>
    </div>
    <div class="flex flex-col gap-3 rounded-xl border border-dg-line bg-dg-panel p-3">
      <VisitPanel {...controls} {darts}>
        <div
          role="status"
          class="flex items-baseline justify-between rounded-xl border border-dg-line bg-dg-raised px-3 py-2"
          aria-label="Visit so far {score}, heals {heal}"
        >
          <span class="font-display text-sm font-bold uppercase tracking-wider text-dg-muted">Heal</span>
          <span class="font-display text-3xl font-bold uppercase text-dg-heal">+{heal}</span>
          <span class="text-sm text-dg-muted">of {score}{heal < score ? ' · full' : ''}</span>
        </div>
      </VisitPanel>
    </div>
  </div>
</main>
