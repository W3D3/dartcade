<!--
  A step's fields, one branch per step type (Mission-Builder artboard's editors): Checkout, Hit
  targets, Marks, Visits, Score, Average and Fast leg, with the presets of the types that have them.
  `errors` are this step's, by field ("within"), from the shared checks.
-->
<script lang="ts">
  import { targetLabel } from '$shared/missions/describe'
  import type { Step, StepOf, Target } from '$shared/missions/types'
  import { cycleTarget, hitTarget, numberLabel, PRESETS, stepHelp, type FieldErrors } from '$lib/missions/builder'
  import Choice from './Choice.svelte'
  import NumberField from './NumberField.svelte'
  import TargetChips from './TargetChips.svelte'

  let { step = $bindable(), errors }: { step: Step; errors: FieldErrors } = $props()

  type Window = 'none' | 'darts' | 'visit'
  const windowOf = (w: number | 'visit' | undefined): Window => (w === undefined ? 'none' : w === 'visit' ? 'visit' : 'darts')
  const help = $derived(stepHelp(step))
  const GRID = 'grid gap-3 sm:grid-cols-2'
  const GRID3 = 'grid gap-3 sm:grid-cols-3'

  const FINISH = [
    { value: 'double', label: 'Double' },
    { value: 'single', label: 'Single' },
  ] as const
  const COUNTS = [
    { value: true, label: 'In a row' },
    { value: false, label: 'Any' },
  ] as const
  const ORDERS = [
    { value: 'any', label: 'Any order' },
    { value: 'in_order', label: 'In this order' },
  ] as const
  const WINDOWS = [
    { value: 'none', label: 'No limit' },
    { value: 'darts', label: 'Within' },
    { value: 'visit', label: 'One visit' },
  ] as const
  const PER = [
    { value: 'each', label: 'Marks on each target' },
    { value: 'total', label: 'Marks in total' },
  ] as const
  const COMPARE = [
    { value: 'at_least', label: 'At least' },
    { value: 'at_most', label: 'At most' },
    { value: 'exactly', label: 'Exactly' },
    { value: 'not', label: 'Never' },
  ] as const
  const LEG_STARTS = [
    { value: 301, label: '301' },
    { value: 501, label: '501' },
    { value: 701, label: '701' },
  ] as const
</script>

{#snippet presets(items: { label: string; step: Step }[])}
  <div class="flex flex-wrap items-center gap-1.5" role="group" aria-label="Presets">
    <span class="mr-0.5 text-caption text-text-dim">Presets</span>
    {#each items as p (p.label)}
      <button
        type="button"
        class="inline-flex h-7 cursor-pointer items-center rounded-full border border-line-2 bg-transparent px-3 text-small text-ink-2 hover:text-text"
        onclick={() => (step = structuredClone(p.step))}>{p.label}</button
      >
    {/each}
  </div>
{/snippet}

<div class="flex flex-col gap-3">
  {#if step.type === 'checkout'}
    {@const s = step}
    <div class={GRID3}>
      <NumberField
        label="Start score"
        unit="points"
        value={s.start}
        error={errors.get('start')}
        onchange={(v: number | undefined) => (s.start = v ?? NaN)}
      />
      <NumberField
        label="Max darts"
        unit="darts"
        value={s.maxDarts}
        error={errors.get('maxDarts')}
        onchange={(v: number | undefined) => (s.maxDarts = v ?? NaN)}
      />
      <Choice
        label="Finish"
        options={[...FINISH, { value: 'master', label: 'Master' } as const]}
        value={s.finish}
        onchange={(v: StepOf<'checkout'>['finish']) => (s.finish = v)}
      />
    </div>
  {:else if step.type === 'hit'}
    {@const s = step}
    <TargetChips
      label="Targets"
      targets={s.targets}
      inOrder={s.order === 'in_order' && s.targets.length > 1}
      error={errors.get('targets')}
      labelOf={targetLabel}
      cycle={cycleTarget}
      onadd={(n: number) => (s.targets = [...s.targets, hitTarget(n)])}
      onchange={(t: Target[]) => (s.targets = t)}
    />
    <div class={GRID}>
      <NumberField
        label={s.targets.length > 1 ? 'Hits needed per target' : 'Hits needed'}
        unit="hits"
        value={s.hits}
        error={errors.get('hits')}
        onchange={(v: number | undefined) => (s.hits = v ?? NaN)}
      />
      {#if s.targets.length > 1}
        <Choice label="Order" options={ORDERS} value={s.order} onchange={(v: StepOf<'hit'>['order']) => (s.order = v)} />
      {/if}
      <Choice label="Counts" options={COUNTS} value={s.inARow} onchange={(v: boolean) => (s.inARow = v)} />
      <div class="flex min-w-0 items-end gap-2 sm:col-span-2">
        <div class="min-w-0 flex-1">
          <Choice
            label="Window"
            options={WINDOWS}
            value={windowOf(s.within)}
            error={windowOf(s.within) === 'darts' ? undefined : errors.get('within')}
            onchange={(v: Window) => {
              if (v === 'none') delete s.within
              else s.within = v === 'visit' ? 'visit' : Math.max(3, s.hits * s.targets.length)
            }}
          />
        </div>
        {#if typeof s.within === 'number'}
          <div class="w-32 flex-none">
            <NumberField
              label="Darts"
              unit="darts"
              value={s.within}
              error={errors.get('within')}
              onchange={(v: number | undefined) => (s.within = v ?? NaN)}
            />
          </div>
        {/if}
      </div>
    </div>
  {:else if step.type === 'marks'}
    {@const s = step}
    <div class="grid gap-3 sm:grid-cols-[1.4fr_1fr_1fr]">
      <TargetChips
        label="Targets"
        addLabel="Add"
        targets={s.targets}
        error={errors.get('targets')}
        labelOf={numberLabel}
        taken={(n: number) => s.targets.includes(n)}
        onadd={(n: number) => (s.targets = [...s.targets, n])}
        onchange={(t: number[]) => (s.targets = t)}
      />
      <NumberField
        label="Marks needed"
        unit="marks"
        value={s.marks}
        error={errors.get('marks')}
        onchange={(v: number | undefined) => (s.marks = v ?? NaN)}
      />
      <NumberField
        label="Within"
        unit="darts"
        optional
        value={s.within}
        error={errors.get('within')}
        onchange={(v: number | undefined) => {
          if (v === undefined) delete s.within
          else s.within = v
        }}
      />
    </div>
    {#if s.targets.length > 1}
      <Choice label="With several targets" options={PER} value={s.per} onchange={(v: StepOf<'marks'>['per']) => (s.per = v)} />
    {/if}
  {:else if step.type === 'visits'}
    {@const s = step}
    <div class="flex min-w-0 items-end gap-2">
      <div class="min-w-0 flex-1">
        <Choice label="Every visit" options={COMPARE} value={s.compare} onchange={(v: StepOf<'visits'>['compare']) => (s.compare = v)} />
      </div>
      <div class="w-32 flex-none">
        <NumberField
          label="Score"
          unit="points"
          value={s.points}
          error={errors.get('points')}
          onchange={(v: number | undefined) => (s.points = v ?? NaN)}
        />
      </div>
    </div>
    <div class={GRID}>
      <NumberField
        label="Visits"
        unit="visits"
        value={s.visits}
        error={errors.get('visits')}
        onchange={(v: number | undefined) => (s.visits = v ?? NaN)}
      />
      <Choice label="Counts" options={COUNTS} value={s.inARow} onchange={(v: boolean) => (s.inARow = v)} />
    </div>
  {:else if step.type === 'score'}
    {@const s = step}
    <div class={GRID}>
      <NumberField
        label="Score at least"
        unit="points"
        value={s.points}
        error={errors.get('points')}
        onchange={(v: number | undefined) => (s.points = v ?? NaN)}
      />
      <NumberField
        label="Within"
        unit="darts"
        value={s.within}
        error={errors.get('within')}
        onchange={(v: number | undefined) => (s.within = v ?? NaN)}
      />
    </div>
  {:else if step.type === 'average'}
    {@const s = step}
    <div class={GRID}>
      <NumberField
        label="3-dart average at least"
        unit="avg"
        step={0.1}
        value={s.average}
        error={errors.get('average')}
        onchange={(v: number | undefined) => (s.average = v ?? NaN)}
      />
      <NumberField
        label="Over"
        unit="visits"
        value={s.visits}
        error={errors.get('visits')}
        onchange={(v: number | undefined) => (s.visits = v ?? NaN)}
      />
    </div>
  {:else if step.type === 'leg'}
    {@const s = step}
    <div class={GRID3}>
      <Choice label="Start" options={LEG_STARTS} value={s.start} onchange={(v: StepOf<'leg'>['start']) => (s.start = v)} />
      <NumberField
        label="Within"
        unit="darts"
        value={s.within}
        error={errors.get('within')}
        onchange={(v: number | undefined) => (s.within = v ?? NaN)}
      />
      <Choice label="Finish" options={FINISH} value={s.finish} onchange={(v: StepOf<'leg'>['finish']) => (s.finish = v)} />
    </div>
  {/if}

  {#if help}<span class="text-caption text-text-dim">{help}</span>{/if}
  {#if step.type === 'hit'}{@render presets(PRESETS.hit)}{/if}
  {#if step.type === 'marks'}{@render presets(PRESETS.marks)}{/if}
  {#if step.type === 'visits'}{@render presets(PRESETS.visits)}{/if}
</div>
