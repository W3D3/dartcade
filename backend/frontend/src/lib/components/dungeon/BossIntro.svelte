<script lang="ts">
  // The boss's entrance (Dungeon-Pixel-Boss, -Boss-Phone): the floor, the boss's name and sprite under
  // red spotlights, its weak and immune spots and HP, what it opens with, the party, and Fight. It
  // stands in front of the boss fight until Fight or the first dart; the fight is already on.
  import { Ghost, Hourglass, Swords } from '@lucide/svelte'
  import type { DungeonGame } from '$lib/api/game-ws'
  import { enemyName, spotsText } from '$lib/dungeon/battle'
  import { ENEMIES, isEnemyId } from '$shared/dungeon/content/enemies'
  import { isClassId } from '$shared/dungeon/content/classes'
  import PixelSprite from './PixelSprite.svelte'

  let {
    game,
    boss,
    names,
    onfight = null,
  }: {
    game: DungeonGame
    boss: NonNullable<DungeonGame['battle']>['enemies'][number]
    names: string[]
    onfight?: (() => void) | null
  } = $props()

  const tagline = $derived(isEnemyId(boss.kind) ? ENEMIES[boss.kind].note : '')
  const pills = $derived([
    ...(boss.weak.length ? [{ text: `Weak: ${spotsText(boss.weak)}`, colour: '#5bd37a' }] : []),
    ...(boss.immune.length ? [{ text: `Immune: ${spotsText(boss.immune)}`, colour: '#c9bfd8' }] : []),
    ...(boss.resist.length ? [{ text: `Resists: ${spotsText(boss.resist)}`, colour: '#f2a33a' }] : []),
    { text: `${boss.hp} HP`, colour: '#e0463c' },
  ])
</script>

<section
  class="relative flex min-h-full flex-col items-center gap-3 overflow-hidden rounded-xl bg-[radial-gradient(ellipse_at_50%_35%,#3a1a22_0%,#1a1420_60%,#14101a_100%)] px-4 pt-6 pb-5"
  aria-label="Boss: {enemyName(boss.kind)}"
  data-testid="dungeon-boss"
>
  <!-- the spotlights: soft red beams falling on the boss -->
  <span
    aria-hidden="true"
    class="pointer-events-none absolute inset-0 bg-[conic-gradient(from_160deg_at_50%_-10%,transparent_0deg,rgba(224,70,60,0.14)_8deg,transparent_16deg,transparent_26deg,rgba(224,70,60,0.12)_34deg,transparent_42deg)]"
  ></span>
  <span class="relative font-display text-base font-bold tracking-wide text-live-text uppercase">Floor {game.floor} · Boss</span>
  <h2
    class="relative text-center font-display text-6xl leading-none font-bold text-dg-text uppercase [text-shadow:0_6px_0_#0e0a14] md:text-7xl"
  >
    {enemyName(boss.kind)}
  </h2>
  {#if tagline}<p class="relative max-w-md text-center text-dg-muted">{tagline}</p>{/if}
  <span class="relative my-1 drop-shadow-[0_0_40px_rgba(224,70,60,0.45)]">
    {#if isEnemyId(boss.kind)}<PixelSprite id={boss.kind} scale={5} flip shadow class="max-md:hidden" /><PixelSprite
        id={boss.kind}
        scale={4}
        flip
        shadow
        class="md:hidden"
      />{/if}
  </span>
  <div class="relative flex flex-wrap justify-center gap-2">
    {#each pills as p (p.text)}
      <span
        class="rounded-full border bg-dg-bg px-2.5 py-0.5 font-display text-sm font-bold tracking-wide uppercase"
        style="border-color: {p.colour}; color: {p.colour}">{p.text}</span
      >
    {/each}
  </div>
  <div class="relative flex w-full max-w-md items-center gap-4 rounded-xl border border-dg-line bg-dg-panel/80 px-4 py-3">
    <span
      class="inline-flex shrink-0 items-center gap-1.5 rounded-md border-2 border-[#0e0a14] bg-dg-text py-1 pr-2.5 pl-2 text-xl text-dg-bg"
    >
      {#if boss.intent.kind === 'attack'}
        {#if boss.intent.pierce}<Ghost class="size-5" aria-hidden="true" />{:else}<Swords class="size-5" aria-hidden="true" />{/if}
        <span class="font-bold text-[#a52a24]">{boss.intent.value}</span>
      {:else}<Hourglass class="size-5" aria-hidden="true" />{/if}
    </span>
    <span class="flex min-w-0 flex-col">
      <span class="font-display text-base font-bold tracking-wide uppercase">Opens with {boss.intent.name}</span>
      <span class="text-sm text-dg-muted">
        {boss.intent.kind === 'attack'
          ? `${boss.intent.value} damage to every hero.${boss.intent.pierce ? ' It ignores block.' : ' Raise your block first.'}`
          : 'It gathers itself this round: hit it hard.'}
      </span>
    </span>
  </div>

  <div class="relative mt-auto flex w-full flex-col items-center gap-4 pt-4 md:flex-row md:items-end md:justify-between">
    <ul class="flex items-end gap-4 p-0" aria-label="Party">
      {#each game.heroes as h (h.seat)}
        <li title={names[h.seat]}>
          {#if h.classId && isClassId(h.classId)}<PixelSprite id={h.classId} scale={3} shadow label={names[h.seat]} />{/if}
        </li>
      {/each}
    </ul>
    {#if onfight}
      <div class="flex w-full flex-col items-stretch gap-2 md:w-[220px] md:items-end">
        <span class="text-sm text-dg-muted max-md:hidden">Throw any dart or tap to begin</span>
        <button
          type="button"
          class="h-14 w-full rounded-xl bg-dg-gold font-display text-xl font-bold tracking-wide text-dg-bg uppercase hover:bg-[#ffe08a] focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-dg-gold"
          onclick={onfight}>Fight</button
        >
      </div>
    {/if}
  </div>
</section>
