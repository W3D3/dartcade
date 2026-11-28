<!-- Throw: the board (click a segment to throw there, or place a segment item), the open visit, a script box. -->
<script lang="ts">
  import DartBoard from '$lib/components/DartBoard.svelte'
  import type { Playground } from '$lib/dungeon/playground/store.svelte'
  import { hitOf, type Hit } from '$shared/dungeon/hit.js'
  import { DUNGEON_RULES } from '$shared/dungeon/rules.js'
  import { SEGS, segAngle } from '$shared/board.js'
  import { pickables } from '$lib/dungeon/playground/catalogue'
  import { hitLabel, parseScript } from '$lib/dungeon/playground/script'
  import { BTN, CARD, FIELD, H2 } from '$lib/dungeon/playground/ui'
  import type { Segment } from '$lib/api/game-ws'

  let { pg }: { pg: Playground } = $props()

  let mode = $state<'throw' | 'place'>('throw')
  let item = $state('')
  let notice = $state('')

  const st = $derived(pg.state)
  const cat = $derived(pg.catalogue)
  const itemRows = $derived(pickables(cat.items))
  const parsed = $derived(parseScript(pg.script))
  const full = $derived(st.visit.length >= DUNGEON_RULES.dartsPerVisit)

  const segmentOf = (h: Hit): Segment => ({
    name: hitLabel(h),
    number: h.ring === 'bullseye' ? 50 : h.number,
    bed:
      h.ring === 'miss'
        ? 'Outside'
        : h.ring === 'treble'
          ? 'Triple'
          : h.ring === 'double' || h.ring === 'bullseye'
            ? 'Double'
            : 'SingleOuter',
    multiplier: h.ring === 'treble' ? 3 : h.ring === 'double' ? 2 : h.ring === 'miss' ? 0 : 1,
  })
  const boardDarts = $derived(st.visit.map(h => ({ segment: segmentOf(h), score: h.score })))

  function onBoardClick({ segment }: { segment: Segment }) {
    if (mode === 'throw') {
      pg.do({ t: 'dart', hit: hitOf(segment) })
      return
    }
    const number = segment.number === 50 ? 25 : segment.number
    if (!item) return void (notice = 'Pick an item to place first')
    if (pg.setup.items.filter(i => i.number === number).length >= DUNGEON_RULES.slotsPerNumber)
      return void (notice = `${number === 25 ? 'The bull' : number} is full: a number holds ${DUNGEON_RULES.slotsPerNumber}`)
    pg.setup.items.push({ number, item })
    notice = ''
  }

  function runScript() {
    // full visits resolve as they fill; the remainder stays open. Counted here: a derived read inside the loop can be stale
    let open = st.visit.length
    for (const hit of parsed.hits) {
      if (open >= DUNGEON_RULES.dartsPerVisit) break
      pg.do({ t: 'dart', hit })
      if (++open >= DUNGEON_RULES.dartsPerVisit) {
        pg.do({ t: 'end' })
        open = 0
      }
    }
  }
  const pos = (number: number) => {
    const a = segAngle(SEGS.indexOf(number))
    return number === 25 ? { x: 0, y: 0.02 } : { x: Math.cos(a) * 0.8, y: -Math.sin(a) * 0.8 }
  }
</script>

{#snippet marks(z: number)}
  {#each pg.setup.items as it, i (i)}
    {@const p = pos(it.number)}
    <circle cx={p.x} cy={p.y} r={0.045 / Math.sqrt(z)} fill="var(--color-accent)" stroke="var(--color-bg)" stroke-width="0.008" />
    <text
      x={p.x}
      y={p.y + 0.012 / Math.sqrt(z)}
      text-anchor="middle"
      font-size={0.05 / Math.sqrt(z)}
      fill="var(--color-bg)"
      font-family="Barlow Condensed, sans-serif"
      font-weight="700">{(cat.items[it.item]?.name ?? it.item)[0]}</text
    >
  {/each}
{/snippet}

<section class="flex min-w-0 flex-col gap-3" aria-label="Throw">
  <h2 class={H2}>Throw</h2>
  <div class={CARD}>
    <div class="flex flex-wrap gap-1" role="tablist" aria-label="Active hero">
      {#each st.heroes as h, i (i)}
        <button
          class="{BTN} {st.seat === i ? 'border-accent text-accent' : ''}"
          role="tab"
          aria-selected={st.seat === i}
          onclick={() => pg.do({ t: 'seat', seat: i })}
        >
          Hero {i + 1}{h.classId ? ` · ${cat.classes[h.classId]?.name ?? h.classId}` : ''}{h.hp <= 0 ? ' (down)' : ''}
        </button>
      {/each}
    </div>
    <div class="flex flex-wrap items-center gap-2 text-sm">
      <span class="text-text-muted">Click the board to</span>
      <button
        class="{BTN} {mode === 'throw' ? 'border-accent text-accent' : ''}"
        aria-pressed={mode === 'throw'}
        onclick={() => (mode = 'throw')}>Throw a dart</button
      >
      <button
        class="{BTN} {mode === 'place' ? 'border-accent text-accent' : ''}"
        aria-pressed={mode === 'place'}
        onclick={() => (mode = 'place')}>Place item</button
      >
      {#if mode === 'place'}
        <select class={FIELD} bind:value={item} aria-label="Segment item to place">
          <option value="">Pick an item</option>
          {#each itemRows as r (r.id)}<option value={r.id} title={r.description}>{r.name} ({r.rarity})</option>{/each}
        </select>
      {/if}
    </div>
    {#if notice}<p class="text-xs text-warn" role="status">{notice}</p>{/if}
    <div class="mx-auto aspect-square w-full max-w-md"><DartBoard darts={boardDarts} overlay={marks} {onBoardClick} /></div>
    <div class="flex flex-wrap items-center gap-2" aria-label="Open visit">
      {#each Array.from({ length: DUNGEON_RULES.dartsPerVisit }, (_, i) => st.visit.at(i)) as h, i (i)}
        <span
          class="inline-flex h-9 min-w-14 items-center justify-center rounded-md border border-dashed border-line-2 px-2 text-sm {h
            ? 'text-text'
            : 'text-text-muted'}">{h ? hitLabel(h) : `dart ${i + 1}`}</span
        >
      {/each}
    </div>
    <div class="flex flex-wrap gap-2">
      <button class={BTN} disabled={!st.visit.length} onclick={() => pg.do({ t: 'undo' })}>Undo dart</button>
      <button class={BTN} disabled={!st.visit.length} onclick={() => pg.do({ t: 'clear' })}>Clear visit</button>
      <button class={BTN} disabled={full} onclick={() => pg.do({ t: 'random' })}>Random throw</button>
      <button class="{BTN} border-accent text-accent" disabled={!st.visit.length} onclick={() => pg.do({ t: 'end' })}>End visit</button>
    </div>
    {#if st.visit.length > 0 && !full}<p class="text-xs text-text-muted">
        A real visit has {DUNGEON_RULES.dartsPerVisit} darts; this one resolves as thrown.
      </p>{/if}
  </div>

  <div class={CARD}>
    <label class="flex flex-col gap-1 text-sm"
      >Throw script
      <textarea class="{FIELD} h-20 py-1 font-mono" bind:value={pg.script} placeholder="t20 t20 s5, D16 25 miss, 20x3" spellcheck="false"
      ></textarea>
    </label>
    {#if parsed.errors.length}
      <ul class="p-0 text-xs text-danger-text" role="alert">
        {#each parsed.errors as e, i (i)}<li><code>{e.token}</code>: {e.message}</li>{/each}
      </ul>
    {/if}
    <div class="flex items-center gap-2">
      <button class="{BTN} whitespace-nowrap" disabled={!parsed.hits.length} onclick={runScript}>Throw script ({parsed.hits.length})</button
      >
      <span class="text-xs text-text-muted">Full visits of {DUNGEON_RULES.dartsPerVisit} resolve; a remainder stays open.</span>
    </div>
  </div>
</section>
