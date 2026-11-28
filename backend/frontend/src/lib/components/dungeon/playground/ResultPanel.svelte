<!-- Result: the resolution trace, what the visit changed, the enemy turn, raw JSON, and the log with rewind and replay checks. -->
<script lang="ts">
  import type { Playground } from '$lib/dungeon/playground/store.svelte'
  import { intentValue } from '$shared/dungeon/enemyTurn.js'
  import { rulesOf } from '$shared/dungeon/rules.js'
  import { alive } from '$shared/dungeon/state.js'
  import { hitLabel } from '$lib/dungeon/playground/script'
  import { determinism, diff, type Action, type Change } from '$lib/dungeon/playground/session'
  import { testCase } from '$lib/dungeon/playground/testcase'
  import { stepWords } from '$lib/dungeon/playground/trace'
  import { BTN, BTN_SM, CARD, H2 } from '$lib/dungeon/playground/ui'

  let { pg }: { pg: Playground } = $props()

  const st = $derived(pg.state)
  const cat = $derived(pg.catalogue)
  const trace = $derived(st.trace)
  const changes = $derived<Change[]>(st.before ? diff(st.before, st) : [])
  const turnChanges = $derived<Change[]>(st.turnBefore ? diff(st.turnBefore, st) : [])

  // Stepping reveals the trace's darts one by one; a new visit shows all of it again
  let reveal = $state(99)
  let seenTrace: unknown = null
  $effect(() => {
    if (trace !== seenTrace) {
      seenTrace = trace
      reveal = 99
    }
  })
  const shown = $derived(trace ? trace.darts.slice(0, reveal) : [])
  const stepNo = $derived(Math.min(reveal, trace?.darts.length ?? 0))

  let determinismResult = $state('')
  let testText = $state('')
  let copied = $state('')

  async function copy(label: string, text: string) {
    try {
      await navigator.clipboard.writeText(text)
      copied = `Copied ${label}`
    } catch {
      copied = `Could not copy ${label}: select it by hand`
    }
  }
  const logLine = (a: Action): string =>
    a.t === 'dart'
      ? `Throw ${hitLabel(a.hit)}`
      : a.t === 'seat'
        ? `Hero ${a.seat + 1} up`
        : a.t === 'random'
          ? 'Random throw'
          : a.t === 'end'
            ? 'End visit'
            : a.t === 'enemyTurn'
              ? 'Enemy turn'
              : a.t === 'undo'
                ? 'Undo dart'
                : 'Clear visit'
  const tgt = (uid: string | null) => (uid === null ? 'nobody' : `enemy ${Number(uid.slice(1)) + 1}`)
  const rules = $derived(rulesOf(pg.setup.cfg))
</script>

<section class="flex min-w-0 flex-col gap-3" aria-label="Result">
  <h2 class={H2}>Result</h2>

  <div class={CARD}>
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h3 class="text-sm font-semibold">Resolution trace</h3>
      {#if trace}
        <div class="flex items-center gap-1 text-xs">
          <button class={BTN_SM} disabled={stepNo <= 0} onclick={() => (reveal = stepNo - 1)}>Back</button>
          <span class="tabular-nums">{stepNo}/{trace.darts.length} darts</span>
          <button class={BTN_SM} disabled={stepNo >= trace.darts.length} onclick={() => (reveal = stepNo + 1)}>Step</button>
          <button class={BTN_SM} onclick={() => (reveal = 99)}>All</button>
        </div>
      {/if}
    </div>
    {#if !trace}
      <p class="text-sm text-text-muted">Throw a visit and press End visit: every effect that fired shows up here, in order.</p>
    {:else}
      <p class="text-sm">Hero {(st.traceSeat ?? 0) + 1}'s visit dealt <strong>{trace.total}</strong> damage.</p>
      {#each shown as d, i (i)}
        <details class="rounded-md border border-line-2 bg-bg" open={i === shown.length - 1}>
          <summary class="cursor-pointer px-2 py-1.5 text-sm">
            Dart {i + 1}: {hitLabel({ number: d.number, ring: d.ring, score: 0 })} → <strong>{d.damage}</strong> on {tgt(d.target)}
            <span class="text-text-muted">({d.hpBefore} → {d.hpAfter}{d.killed ? ', killed' : ''})</span>
          </summary>
          <ol class="flex flex-col gap-1 p-2">
            {#each d.steps as step, k (k)}
              {@const w = stepWords(step, cat)}
              <li class="rounded-sm border border-line bg-surface-1 px-2 py-1 text-xs" data-source={step.source} data-id={step.id ?? ''}>
                <span class="font-semibold">{w.name}</span>
                <span class="text-text-muted"> · {w.effect}{step.target ? ` on ${tgt(step.target)}` : ''}</span>
                <span class="float-right tabular-nums">{step.base} × {step.mult} = {Math.floor(step.base * step.mult)}</span>
                {#if w.description}<span class="block text-text-muted">{w.description}</span>{/if}
              </li>
            {/each}
          </ol>
        </details>
      {/each}
      {#if stepNo >= trace.darts.length && trace.afterVisit.length}
        <details class="rounded-md border border-line-2 bg-bg" open>
          <summary class="cursor-pointer px-2 py-1.5 text-sm">After the visit</summary>
          <ol class="flex flex-col gap-1 p-2">
            {#each trace.afterVisit as step, k (k)}
              {@const w = stepWords(step, cat)}
              <li class="rounded-sm border border-line bg-surface-1 px-2 py-1 text-xs" data-source="afterVisit" data-id={step.id ?? ''}>
                <span class="font-semibold">{w.name}</span><span class="text-text-muted">
                  · {w.effect}{step.target ? ` on ${tgt(step.target)}` : ''}</span
                >
                {#if w.description}<span class="block text-text-muted">{w.description}</span>{/if}
              </li>
            {/each}
          </ol>
        </details>
      {/if}
      <h4 class="text-sm font-semibold">What the visit changed</h4>
      {@render table(changes)}
    {/if}
  </div>

  <div class={CARD}>
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h3 class="text-sm font-semibold">Enemy turn · round {st.round}</h3>
      <button class="{BTN} border-accent text-accent" onclick={() => pg.do({ t: 'enemyTurn' })}>Run enemy turn</button>
    </div>
    <ul class="p-0 text-xs text-text-muted" aria-label="Intents this round">
      {#each st.enemies.filter(alive) as e, i (e.uid)}
        {@const v = intentValue(e, st.round, pg.setup.cfg.difficulty, rules)}
        <li>
          Enemy {i + 1}
          {cat.enemies[e.kind]?.name}: {v === null ? 'does nothing' : `attacks every hero for ${v}${e.chilled ? ' (chilled)' : ''}`}{e.burn
            ? `, burns for ${e.burn} at the end`
            : ''}
        </li>
      {/each}
    </ul>
    {#if st.turn}
      <h4 class="text-sm font-semibold">Last enemy turn</h4>
      <ul class="p-0 text-xs" aria-label="Last enemy turn">
        {#each st.turn.attacks as a (a.uid)}
          {#each a.hits as h (h.seat)}
            <li>{tgt(a.uid)} hit hero {h.seat + 1}: {h.blocked} blocked, {h.damage} HP lost</li>
          {/each}
        {/each}
        {#each st.turn.burns as b (b.uid)}<li>{tgt(b.uid)} burned for {b.damage}</li>{/each}
      </ul>
      {@render table(turnChanges)}
    {/if}
  </div>

  <div class={CARD}>
    <h3 class="text-sm font-semibold">Log ({pg.log.length})</h3>
    <ol class="flex max-h-48 list-decimal flex-col gap-1 overflow-y-auto pl-6 text-xs">
      {#each pg.log as a, i (i)}
        <li><span class="mr-2">{logLine(a)}</span><button class={BTN_SM} onclick={() => pg.rewind(i + 1)}>Rewind to here</button></li>
      {/each}
    </ol>
    <div class="flex flex-wrap gap-2">
      <button class={BTN} disabled={!pg.log.length} onclick={() => pg.rewind(0)}>Rewind to start</button>
      <button
        class={BTN}
        onclick={() => {
          const r = determinism($state.snapshot(pg.setup), $state.snapshot(pg.log))
          determinismResult = `${r.ok ? 'Deterministic' : 'NOT deterministic'}: ${r.detail}`
        }}>Determinism check</button
      >
      <button class={BTN} onclick={() => (testText = testCase($state.snapshot(pg.setup), $state.snapshot(pg.log)))}
        >Copy as a test case</button
      >
    </div>
    {#if determinismResult}<p class="text-xs" role="status">{determinismResult}</p>{/if}
    {#if testText}
      <textarea
        class="h-40 rounded-md border border-line-2 bg-bg p-2 font-mono text-xs"
        readonly
        aria-label="Vitest snippet"
        value={testText}></textarea>
      <button class={BTN} onclick={() => copy('the test', testText)}>Copy to clipboard</button>
    {/if}
    {#if copied}<p class="text-xs text-text-muted" role="status">{copied}</p>{/if}
  </div>

  <div class={CARD}>
    <details>
      <summary class="cursor-pointer text-sm font-semibold">Raw state JSON</summary>
      <button class={BTN_SM} onclick={() => copy('the state', JSON.stringify(st, null, 2))}>Copy</button>
      <pre class="max-h-72 overflow-auto text-xs">{JSON.stringify(st, null, 2)}</pre>
    </details>
    <details>
      <summary class="cursor-pointer text-sm font-semibold">Raw trace JSON</summary>
      <button class={BTN_SM} onclick={() => copy('the trace', JSON.stringify(trace, null, 2))}>Copy</button>
      <pre class="max-h-72 overflow-auto text-xs">{JSON.stringify(trace, null, 2)}</pre>
    </details>
  </div>
</section>

{#snippet table(rows: Change[])}
  {#if rows.length}
    <table class="w-full border-collapse text-xs">
      <thead><tr class="text-left text-text-muted"><th class="py-1">What</th><th>Before</th><th>After</th></tr></thead>
      <tbody>
        {#each rows as c (c.what)}
          <tr class="border-t border-line"
            ><td class="py-1">{c.what}</td><td class="tabular-nums">{c.before}</td><td class="tabular-nums font-semibold">{c.after}</td></tr
          >
        {/each}
      </tbody>
    </table>
  {:else}
    <p class="text-xs text-text-muted">Nothing changed.</p>
  {/if}
{/snippet}
