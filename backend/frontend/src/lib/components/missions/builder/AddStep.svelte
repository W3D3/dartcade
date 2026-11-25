<!--
  The builder's Add a step: a dashed button, then the seven types ("What should step 4 be?"), then
  the new step's fields with Change type, Cancel and Add step. Adding checks the step first.
-->
<script lang="ts">
  import { ChartLine, Crosshair, Flag, Plus, Repeat, Sigma, X as Marks, Zap } from '@lucide/svelte'
  import type { Component } from 'svelte'
  import { tick } from 'svelte'
  import type { Step, StepType } from '$shared/missions/types'
  import { newStep, STEP_TYPES, typeLabel, type FieldErrors } from '$lib/missions/builder'
  import { Button } from '$lib/components/ui/button/index.js'
  import StepFields from './StepFields.svelte'

  let {
    n,
    open = $bindable(),
    errorsOf,
    onadd,
  }: {
    /** The number the new step gets. */
    n: number
    open: boolean
    /** The checks' errors for a step at this place. */
    errorsOf: (step: Step) => FieldErrors
    onadd: (step: Step) => void
  } = $props()

  const ICONS: Record<StepType, Component<{ size?: number }>> = {
    checkout: Flag,
    hit: Crosshair,
    marks: Marks,
    visits: Repeat,
    score: Sigma,
    average: ChartLine,
    leg: Zap,
  }

  let step = $state<Step | null>(null)
  let tried = $state(false)
  let grid = $state<HTMLElement | null>(null)
  const errors = $derived(step && tried ? errorsOf(step) : new Map<string, string>())

  async function openSheet() {
    open = true
    await tick()
    grid?.querySelector('button')?.focus()
  }
  function close() {
    open = false
    step = null
    tried = false
  }
  function pick(type: StepType) {
    step = newStep(type)
    tried = false
  }
  function add() {
    if (!step) return
    tried = true
    if (errorsOf(step).size > 0) return
    onadd(step)
    close()
  }
</script>

{#if !open}
  <button
    type="button"
    class="flex h-[52px] cursor-pointer items-center justify-center gap-2 rounded-card border-[1.5px] border-dashed border-line-3 bg-transparent text-body font-semibold text-accent"
    onclick={() => void openSheet()}><Plus size={18} />Add a step</button
  >
{:else if step === null}
  <div class="flex flex-col gap-2.5 rounded-card border-[1.5px] border-dashed border-line-3 p-3.5">
    <div class="flex items-center">
      <span class="text-label font-semibold">What should step {n} be?</span>
      <Button variant="quiet" size="sm" class="ml-auto px-2" onclick={close}>Cancel</Button>
    </div>
    <div bind:this={grid} class="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
      {#each STEP_TYPES as t (t.type)}
        {@const Icon = ICONS[t.type]}
        <button
          type="button"
          class="flex cursor-pointer flex-col items-start gap-1 rounded-md border border-dashed border-line-3 bg-transparent px-3 py-2.5 text-left hover:border-accent-line"
          onclick={() => pick(t.type)}
        >
          <span class="flex items-center gap-1.5 text-body font-semibold text-text"><Icon size={16} />{t.label}</span>
          <span class="text-caption text-text-muted">{t.line}</span>
        </button>
      {/each}
    </div>
  </div>
{:else}
  <div
    class="flex flex-col gap-3 rounded-card border-[1.5px] border-accent-line-strong bg-surface-panel p-3.5"
    role="group"
    aria-label="New step {n}"
  >
    <div class="flex flex-wrap items-center gap-2.5">
      <span
        class="inline-flex h-[22px] items-center rounded-full bg-accent-tint px-2 text-micro font-bold uppercase tracking-wide text-accent"
        >New step {n}</span
      >
      <span class="text-body font-semibold">{typeLabel(step.type)}</span>
      <button
        type="button"
        class="cursor-pointer border-0 bg-transparent p-0 text-small text-text-muted underline"
        onclick={() => (step = null)}>Change type</button
      >
      <span class="ml-auto flex gap-1.5">
        <Button variant="quiet" size="sm" class="px-2" onclick={close}>Cancel</Button>
        <Button variant="accent" size="sm" onclick={add}>Add step</Button>
      </span>
    </div>
    <StepFields bind:step {errors} />
    {#if tried && errors.size > 0}<span class="sr-only" role="alert">Step {n} needs a look before it can be added.</span>{/if}
  </div>
{/if}
