<script lang="ts" module>
  import { Crosshair, Plus, Shield, Sparkles, Swords } from '@lucide/svelte'
  import type { ClassId } from '$shared/dungeon/content/classes'

  // The class icon on a hero's plate (Dungeon-Pixel-Battle: line icons, not sprites)
  const CLASS_ICON = { archer: Crosshair, brawler: Swords, healer: Plus, mage: Sparkles, guardian: Shield } as const satisfies Record<
    ClassId,
    unknown
  >
</script>

<script lang="ts">
  // The battle scene (Dungeon-Pixel-Battle, -Battle-Phone): the party on the left in seat order, the
  // enemies on the right, all on one floor. Each hero has a plate (name, class icon, block bar, HP bar)
  // and the thrower a bobbing arrow; each enemy its intent bubble over its head and a plate (name, HP,
  // icon chips for its defences and statuses), the front enemy gold brackets and a gold plate. While
  // the damage popup plays, `popup` drives the enemies' HP and the damage numbers over them, and each
  // new `cue` fires a pixel effect on a hero or an enemy. `compact` is the phone's: small sprites, the
  // hero plates as a name and bars under each, the enemy plates as cards under the scene. With the
  // popup on a tablet or TV the scene shrinks to a strip (Dungeon-Pixel-Damage), so the popup fits.
  import { ArrowDown, Hourglass, Ghost } from '@lucide/svelte'
  import type { DungeonGame } from '$lib/api/game-ws'
  import { enemyChips, enemyName } from '$lib/dungeon/battle'
  import type { Popup } from '$lib/dungeon/popup'
  import { isClassId } from '$shared/dungeon/content/classes'
  import { isEnemyId } from '$shared/dungeon/content/enemies'
  import type { FxCue, FxShot } from '$lib/dungeon/fx/effects'
  import FxLayer from './FxLayer.svelte'
  import HpBar from './HpBar.svelte'
  import PixelSprite from './PixelSprite.svelte'
  import StatusChip from './StatusChip.svelte'

  let {
    game,
    battle,
    names,
    popup = null,
    before = null,
    front,
    cue = null,
    compact = false,
  }: {
    game: DungeonGame
    battle: NonNullable<DungeonGame['battle']>
    names: string[]
    popup?: Popup | null
    /** Each enemy's HP before the visit the popup plays: the plate hatches what it took. */
    before?: Record<string, number> | null
    /** The enemy marked as the front one: the battle's target, or while the popup plays the one the visit hit. */
    front: string | null
    cue?: FxCue | null
    compact?: boolean
  } = $props()

  let root: HTMLElement | undefined = $state()
  const spots: Record<string, HTMLElement | undefined> = {}
  let shot = $state<FxShot | null>(null)
  $effect(() => {
    if (!cue) return
    const el = spots['enemy' in cue.at ? `e:${cue.at.enemy}` : `h:${cue.at.hero}`]
    if (!root || !el) return
    const a = root.getBoundingClientRect()
    const b = el.getBoundingClientRect()
    shot = { kind: cue.kind, x: b.left - a.left + b.width / 2, y: b.top - a.top + b.height / 2, id: cue.id }
  })

  const hpOf = (uid: string, hp: number) => popup?.hp[uid] ?? hp
  // The sprites' room above the floor and their sizes: the phone's, the strip under the popup, the full scene
  const look = $derived(
    compact
      ? { pad: 16, room: 132, hero: 2.5, enemy: 3.5, boss: 2 }
      : popup
        ? { pad: 16, room: 150, hero: 3, enemy: 4, boss: 2.5 }
        : { pad: 32, room: 250, hero: 5, enemy: 7, boss: 4 },
  )
  const enemyScale = (kind: string) => (kind === 'dungeonWarden' ? look.boss : look.enemy)
  const plateOf = (e: { uid: string; hp: number; maxHp: number }) => {
    const hp = hpOf(e.uid, e.hp)
    return hp < e.maxHp ? `${hp} / ${e.maxHp}` : String(hp)
  }
</script>

{#snippet enemyPlate(e: (typeof battle.enemies)[number], isFront: boolean)}
  {@const hits = popup?.hits[e.uid] ?? []}
  <div
    class="flex min-w-0 flex-col gap-1.5 rounded-xl bg-dg-panel px-2.5 py-2 {isFront
      ? 'border-2 border-dg-gold'
      : 'border border-dg-line'} {hpOf(e.uid, e.hp) === 0 ? 'opacity-40' : ''}"
    data-testid="enemy"
    data-front={isFront || undefined}
  >
    <div class="flex items-baseline justify-between gap-2 font-display text-lg/tight font-bold uppercase tracking-wide">
      <span class="truncate">{enemyName(e.kind)}</span>
      <span class="shrink-0">{plateOf(e)}</span>
    </div>
    <HpBar hp={hpOf(e.uid, e.hp)} maxHp={e.maxHp} tall before={before?.[e.uid] ?? null} />
    <div class="flex flex-wrap items-center gap-[5px]">
      {#each enemyChips(e) as c (c.kind)}<StatusChip {...c} small={compact} />{/each}
      {#if hits.length}
        <span class="ml-auto font-display text-base font-bold text-dg-gold" title="Damage this visit"
          >-{hits.reduce((n, h) => n + h, 0)}</span
        >
      {/if}
    </div>
  </div>
{/snippet}

<section
  bind:this={root}
  aria-label="Battle: {game.heroes.map(h => names[h.seat]).join(', ')} against {battle.enemies.map(e => enemyName(e.kind)).join(', ')}"
  class="relative overflow-hidden rounded-md border-2 border-dg-line bg-[radial-gradient(ellipse_at_50%_30%,#2d2438_0%,#1a1420_70%)] {compact
    ? 'px-2 pb-2'
    : 'px-3 pb-4'}"
  style:padding-top="{look.pad}px"
  data-testid="battle-stage"
>
  <!-- the floor: a dark seam under the feet and the ground fading below it -->
  <span
    aria-hidden="true"
    class="absolute inset-x-0 bottom-0 border-t-4 border-[#0e0a14] bg-linear-to-b from-[#241d2e] to-[#15111b]"
    style:top="{look.pad + look.room}px"
  ></span>

  <div class="relative flex items-start justify-between gap-2">
    <ul class="flex min-w-0 items-start gap-2 p-0 {compact ? '' : 'md:gap-3'}" aria-label="Party">
      {#each game.heroes as h (h.seat)}
        {@const up = h.seat === game.currentPlayer && h.hp > 0}
        {@const Icon = h.classId && isClassId(h.classId) ? CLASS_ICON[h.classId] : null}
        <li class="flex min-w-0 flex-col items-center {h.hp === 0 ? 'opacity-50' : ''}" data-testid="hero">
          <div class="relative flex flex-col items-center justify-end" style:height="{look.room}px">
            {#if up}
              <span
                aria-hidden="true"
                class="pointer-events-none absolute top-1/2 left-1/2 size-[260px] -translate-1/2 bg-[radial-gradient(closest-side,rgba(242,193,78,0.22),transparent)]"
              ></span>
              <ArrowDown
                class="relative mb-2 animate-bob motion-reduce:animate-none text-dg-gold {compact ? 'size-5' : 'size-7'}"
                aria-label="Throwing"
              />
            {/if}
            <span bind:this={spots[`h:${h.seat}`]} class="relative">
              {#if h.classId && isClassId(h.classId)}<PixelSprite id={h.classId} scale={look.hero} shadow />{/if}
            </span>
          </div>
          {#if compact}
            <div class="mt-1.5 flex w-[84px] max-w-full flex-col gap-1 text-center">
              <span class="truncate font-display text-sm font-bold uppercase {up ? 'text-dg-gold' : ''}">{names[h.seat]}</span>
              <HpBar hp={h.block} maxHp={Math.max(1, h.block)} colour="var(--color-dg-block)" class="h-1! bg-[#1a2433]!" />
              <HpBar hp={h.hp} maxHp={h.maxHp} />
              <span class="text-xs">{h.hp}/{h.maxHp}</span>
              {#if h.block}<span class="text-xs text-dg-block">+{h.block} block</span>{/if}
            </div>
          {:else}
            <div
              class="mt-3 flex w-[140px] max-w-full flex-col gap-[5px] rounded-xl bg-dg-panel px-2 py-1.5 {up
                ? 'border-2 border-dg-gold'
                : 'border border-dg-line'}"
            >
              <div class="flex items-baseline justify-between gap-1">
                <span class="truncate font-display text-base font-bold uppercase tracking-wide">{names[h.seat]}</span>
                {#if Icon && h.classId}<Icon class="size-4 shrink-0 text-dg-muted" aria-label={h.classId} />{/if}
              </div>
              <span class="flex items-center gap-1.5" aria-label="Block {h.block}">
                <span class="relative block h-1.5 flex-1 overflow-hidden rounded-[3px] bg-[#1a2433]">
                  <span class="absolute inset-y-0 left-0 rounded-[3px] bg-dg-block" style:width={h.block ? '100%' : '0%'}></span>
                </span>
                <span class="inline-flex items-center gap-[3px] text-sm font-semibold {h.block ? 'text-dg-block' : 'text-[#6a5f7a]'}">
                  <Shield class="size-3.5" aria-hidden="true" />{h.block}
                </span>
              </span>
              <HpBar hp={h.hp} maxHp={h.maxHp} tall />
              <span class="text-sm">{h.hp}/{h.maxHp}</span>
            </div>
          {/if}
        </li>
      {/each}
    </ul>

    <ul class="flex min-w-0 items-start justify-end gap-2 p-0 {compact ? '' : 'md:gap-3'}" aria-label="Enemies">
      {#each battle.enemies as e (e.uid)}
        {@const isFront = e.uid === front}
        {@const hits = popup?.hits[e.uid] ?? []}
        {@const alive = hpOf(e.uid, e.hp) > 0}
        <li class="flex min-w-0 flex-col items-center {isFront && !compact ? 'w-[226px]' : compact ? '' : 'w-[136px]'}">
          <div class="relative flex flex-col items-center justify-end" style:height="{look.room}px">
            {#if alive}
              <span
                class="mb-3 inline-flex items-center gap-1.5 rounded-md border-2 border-[#0e0a14] bg-dg-text py-1 pr-2.5 pl-2 whitespace-nowrap text-dg-bg {compact
                  ? 'text-base'
                  : 'text-xl'}"
                title="Next: {e.intent.name}{e.intent.kind === 'attack'
                  ? `, ${e.intent.value} damage to every hero${e.intent.pierce ? ', ignores block' : ''}`
                  : ''}"
                data-testid="intent"
              >
                {#if e.intent.kind === 'attack'}
                  {#if e.intent.pierce}<Ghost class="size-4" aria-hidden="true" />{:else}<Swords class="size-4" aria-hidden="true" />{/if}
                  <span class="font-bold text-[#a52a24]">{e.intent.value}</span>
                  <span class="sr-only">{e.intent.name}</span>
                {:else}
                  <Hourglass class="size-4" aria-hidden="true" /><span class="sr-only">{e.intent.name}</span>
                {/if}
              </span>
            {/if}
            {#if hits.length}
              <span
                aria-hidden="true"
                class="absolute top-0 -left-2 z-10 flex flex-col items-end font-display font-bold text-dg-gold [text-shadow:0_2px_0_#0e0a14]"
              >
                {#each hits as n, i (i)}
                  <span class={i === hits.length - 1 ? (compact ? 'text-2xl' : 'text-3xl') : compact ? 'text-base' : 'text-2xl'}>-{n}</span>
                {/each}
              </span>
            {/if}
            {#if isFront && !compact}
              <span
                aria-hidden="true"
                class="pointer-events-none absolute bottom-0 left-1/2 size-[260px] -translate-x-1/2 bg-[radial-gradient(closest-side,rgba(242,193,78,0.16),transparent)]"
              ></span>
            {/if}
            <span bind:this={spots[`e:${e.uid}`]} class="relative p-3 {alive ? '' : 'opacity-40 grayscale'}">
              {#if isFront && alive}
                {#each ['top-0 left-0 border-t-4 border-l-4', 'top-0 right-0 border-t-4 border-r-4', 'bottom-0 left-0 border-b-4 border-l-4', 'bottom-0 right-0 border-b-4 border-r-4'] as corner (corner)}
                  <span
                    aria-hidden="true"
                    class="absolute size-5 animate-blink rounded-md motion-reduce:animate-none border-dg-gold {corner}"
                  ></span>
                {/each}
              {/if}
              {#if isEnemyId(e.kind)}<PixelSprite id={e.kind} scale={enemyScale(e.kind)} flip shadow />{/if}
            </span>
          </div>
          {#if !compact}<div class="mt-3 w-full">{@render enemyPlate(e, isFront)}</div>{/if}
        </li>
      {/each}
    </ul>
  </div>
  <FxLayer {shot} />
</section>

{#if compact}
  <div class="grid gap-2" style:grid-template-columns="repeat({battle.enemies.length}, minmax(0, 1fr))" aria-label="Enemies">
    {#each battle.enemies as e (e.uid)}{@render enemyPlate(e, e.uid === front)}{/each}
  </div>
{/if}
