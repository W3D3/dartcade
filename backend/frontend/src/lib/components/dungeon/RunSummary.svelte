<script lang="ts">
  // The run summary (Dungeon-Pixel-Summary, -Summary-Phone): the result, the path taken, each hero's
  // numbers with their artifacts and damage by floor, and the run's best visit. The end screen and the
  // details page both show it; `actions` holds the end screen's buttons.
  import type { Snippet } from 'svelte'
  import { Crown, Flame } from '@lucide/svelte'
  import type { DungeonSummary } from '$lib/api/game-ws'
  import { CLASS_COLOR, ROOMS } from '$lib/dungeon/view'
  import { fmtClock } from '$lib/missions/view'
  import { isArtifactId } from '$shared/dungeon/content/artifacts'
  import { CLASSES, isClassId } from '$shared/dungeon/content/classes'
  import { ENEMIES, isEnemyId } from '$shared/dungeon/content/enemies'
  import { DIFFICULTY_LABEL } from '$shared/dungeon/rules'
  import { mvpOf } from '$shared/dungeon/summary'
  import ArtifactIcon from './ArtifactIcon.svelte'
  import PixelSprite from './PixelSprite.svelte'

  let {
    summary,
    names,
    darts,
    timeMs = null,
    actions,
  }: { summary: DungeonSummary; names: string[]; darts: number[]; timeMs?: number | null; actions?: Snippet } = $props()

  const mvp = $derived(mvpOf(summary))
  const total = $derived(summary.heroes.reduce((n, h) => n + h.damage, 0))
  const fmt = (n: number) => n.toLocaleString('en')
  const RING = { single: 'S', double: 'D', treble: 'T', bull: '', bullseye: '', miss: '' } as const
  const dartLabel = (d: { number: number; ring: keyof typeof RING }) =>
    d.ring === 'miss' ? 'Miss' : d.ring === 'bull' ? '25' : d.ring === 'bullseye' ? 'Bull' : `${RING[d.ring]}${d.number}`
  const result = $derived(summary.outcome === 'victory' ? 'Victory' : summary.outcome === 'defeat' ? 'Defeat' : 'Given up')
  const tiles = $derived([
    { label: 'Result', value: result, accent: summary.outcome === 'victory' },
    { label: 'Floors', value: `${summary.cleared} / ${summary.floors}` },
    { label: 'Time', value: timeMs === null ? '–' : fmtClock(timeMs) },
    { label: 'Total damage', value: fmt(total) },
    { label: 'Darts thrown', value: fmt(darts.reduce((n, d) => n + d, 0)) },
    { label: 'Gold left', value: fmt(summary.gold) },
  ])
  const best = $derived(summary.best)
  const party = $derived(names.slice(0, summary.heroes.length).join(', '))
</script>

<div class="flex flex-col gap-3 text-dg-text" data-testid="dungeon-summary">
  <header class="flex flex-wrap items-end justify-between gap-2">
    <div>
      <h2 class="font-display text-2xl font-bold uppercase text-dg-gold md:text-3xl">Run summary</h2>
      <p class="text-sm text-dg-muted">Act 1 · {DIFFICULTY_LABEL[summary.difficulty]} · {party}</p>
    </div>
  </header>

  <ul class="grid grid-cols-2 gap-2 p-0 sm:grid-cols-3 xl:grid-cols-6">
    {#each tiles as t (t.label)}
      <li class="flex flex-col rounded-xl border border-dg-line bg-dg-panel px-4 py-3">
        <span class="text-sm text-dg-muted">{t.label}</span>
        <span class="font-display text-2xl font-bold uppercase {t.accent ? 'text-dg-gold' : ''}">{t.value}</span>
      </li>
    {/each}
  </ul>

  <section class="hidden rounded-xl border border-dg-line bg-dg-panel px-4 py-3 md:block" aria-label="Path taken">
    <h3 class="mb-2 font-display text-sm font-bold uppercase text-dg-muted">Path taken</h3>
    <ol class="flex items-start p-0">
      {#each summary.path as room, i (i)}
        {@const Icon = ROOMS[room.type].icon}
        <li class="flex flex-1 flex-col items-center gap-1 last:flex-none" title={ROOMS[room.type].label}>
          <span class="flex w-full items-center gap-1">
            <Icon class="size-4 shrink-0 {room.type === 'boss' ? 'text-dg-hp' : 'text-dg-muted'}" />
            {#if i < summary.path.length - 1}<span class="h-0.5 flex-1 rounded-sm bg-dg-gold"></span>{/if}
          </span>
          <span class="self-start font-display text-xs text-dg-dim">{i + 1}</span>
        </li>
      {/each}
    </ol>
  </section>

  <ul class="grid gap-3 p-0 md:grid-cols-[repeat(auto-fit,minmax(18rem,1fr))]">
    {#each summary.heroes as h (h.seat)}
      {@const classId = h.classId && isClassId(h.classId) ? h.classId : null}
      {@const peak = Math.max(1, ...h.damageByFloor)}
      <li
        class="flex flex-col gap-2 rounded-xl border-2 bg-dg-panel p-3 {mvp === h.seat ? 'border-dg-gold' : 'border-dg-line'}"
        data-seat={h.seat}
      >
        <div class="flex items-center gap-3">
          <span class="flex size-12 shrink-0 items-center justify-center rounded-md bg-dg-raised">
            {#if classId}<PixelSprite id={classId} scale={2} />{/if}
          </span>
          <span class="flex min-w-0 flex-col">
            <span class="truncate font-display text-lg font-bold uppercase">{names[h.seat]}</span>
            <span class="text-sm text-dg-muted">{classId ? CLASSES[classId].name : ''}</span>
          </span>
          {#if mvp === h.seat}
            <span
              class="ml-auto flex items-center gap-1 rounded-full bg-dg-gold px-2 py-0.5 font-display text-xs font-bold uppercase text-dg-bg"
              ><Crown class="size-3" />MVP</span
            >
          {/if}
        </div>
        <dl class="grid grid-cols-[1fr_auto] gap-x-2 gap-y-1 text-sm">
          <dt class="text-dg-muted">Damage dealt</dt>
          <dd class="text-right text-dg-gold">{fmt(h.damage)}</dd>
          <dt class="text-dg-muted">Best visit</dt>
          <dd class="text-right">{fmt(h.bestVisit)}</dd>
          <dt class="text-dg-muted max-md:hidden">Best dart</dt>
          <dd class="text-right max-md:hidden">{h.bestDart ? `${dartLabel(h.bestDart)} · ${fmt(h.bestDart.damage)}` : '–'}</dd>
          <dt class="text-dg-muted">Healed</dt>
          <dd class="text-right text-dg-heal">{fmt(h.healed)}</dd>
          <dt class="text-dg-muted">Blocked</dt>
          <dd class="text-right text-dg-block">{fmt(h.blocked)}</dd>
        </dl>
        <div class="flex flex-col gap-1 border-t border-dg-line pt-2 max-md:hidden">
          <span class="text-sm text-dg-muted">Artifacts · {h.artifacts.length}</span>
          <div class="flex flex-wrap gap-1">
            {#each h.artifacts.filter(isArtifactId) as id (id)}<ArtifactIcon {id} owner={names[h.seat]} />{/each}
          </div>
        </div>
        <div class="flex flex-col gap-1 border-t border-dg-line pt-2 max-md:hidden" role="img" aria-label="Damage by floor">
          <span class="text-sm text-dg-muted">Damage by floor</span>
          <div class="flex h-20 items-end gap-1">
            {#each Array.from({ length: summary.floors }, (_, i) => h.damageByFloor[i] ?? 0) as d, i (i)}
              <span class="flex flex-1 flex-col items-center gap-0.5">
                <span
                  class="w-full rounded-t-[3px]"
                  style:height="{(64 * d) / peak}px"
                  style:background={classId ? CLASS_COLOR[classId] : 'var(--color-dg-muted)'}
                  title="Floor {i + 1}: {fmt(d)}"
                ></span>
                <span class="font-display text-xs text-dg-dim">{i + 1}</span>
              </span>
            {/each}
          </div>
        </div>
      </li>
    {/each}
  </ul>

  <section class="flex flex-wrap items-center gap-3 rounded-xl border-2 border-dg-gold bg-dg-gold/10 px-4 py-3">
    <Flame class="size-5 text-dg-gold" />
    <div class="flex min-w-0 flex-1 flex-col">
      <span class="font-display text-sm font-bold uppercase text-dg-gold">Best visit of the run</span>
      <span class="text-sm">
        {#if best}
          {names[best.seat]} · {best.darts.map(dartLabel).join(', ')} · {fmt(best.damage)} damage{best.enemy && isEnemyId(best.enemy)
            ? ` to the ${ENEMIES[best.enemy].name}`
            : ''}
        {:else}
          No damage dealt
        {/if}
      </span>
    </div>
    {#if actions}<div class="flex gap-2">{@render actions()}</div>{/if}
  </section>
</div>
