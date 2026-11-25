<!--
  One step of the builder's list: the drag handle (arrow keys move it too), its number, its title and
  rules in words, and Duplicate and Remove (on phones under the open card's fields); open, its fields.
  One card is open at a time.
-->
<script lang="ts">
  import { ChevronDown, Copy, GripVertical, Trash } from '@lucide/svelte'
  import { stepDetail, stepTitle } from '$shared/missions/describe'
  import type { Step } from '$shared/missions/types'
  import type { FieldErrors } from '$lib/missions/builder'
  import StepFields from './StepFields.svelte'

  let {
    key,
    n,
    step = $bindable(),
    errors,
    open,
    ontoggle,
    onduplicate,
    onremove,
  }: {
    key: string
    n: number
    step: Step
    errors: FieldErrors
    open: boolean
    ontoggle: () => void
    onduplicate?: () => void
    onremove: () => void
  } = $props()

  const id = $props.id()
  // A step with a missing number has no title yet; its rules in words say what it is
  const title = $derived(errors.size > 0 ? `Step ${n}` : stepTitle(step))
  const detail = $derived(errors.size > 0 ? 'Needs a look' : stepDetail(step))
  const ICON =
    'flex size-8 flex-none cursor-pointer items-center justify-center rounded-sm border-0 bg-transparent text-text-dim hover:text-text'
</script>

{#snippet actions()}
  {#if onduplicate}
    <button type="button" class={ICON} aria-label="Duplicate step {n}" onclick={onduplicate}><Copy size={16} /></button>
  {/if}
  <button type="button" class="{ICON} hover:text-danger-text" aria-label="Remove step {n}" onclick={onremove}><Trash size={16} /></button>
{/snippet}

<div
  data-sortable-id={key}
  class="overflow-hidden rounded-card border bg-surface-1 {errors.size > 0 ? 'border-danger-line' : 'border-line'}"
>
  <div class="flex items-center gap-2 py-2.5 pr-2 pl-1.5 md:gap-3 md:pr-3.5">
    <button type="button" data-sortable-handle class="{ICON} touch-none cursor-grab" aria-label="Move step {n}: drag, or use the arrow keys"
      ><GripVertical size={18} /></button
    >
    <span
      class="flex size-7 flex-none items-center justify-center rounded-sm bg-surface-chip font-display text-body-lg font-bold text-accent"
      >{n}</span
    >
    <button
      type="button"
      id="{id}-toggle"
      aria-expanded={open}
      aria-controls="{id}-fields"
      class="flex min-w-0 flex-1 cursor-pointer items-center gap-2 border-0 bg-transparent p-0 text-left"
      onclick={ontoggle}
    >
      <span class="flex min-w-0 flex-1 flex-col">
        <span class="line-clamp-2 text-body font-semibold text-text sm:truncate">{title}</span>
        <span class="truncate text-small {errors.size > 0 ? 'text-danger-text' : 'text-text-muted'}">{detail}</span>
      </span>
      <ChevronDown size={18} class="flex-none text-text-dim transition-transform {open ? 'rotate-180' : ''}" />
    </button>
    <!-- Phones have them under the open card's fields (Mission-Builder-Phone) -->
    <span class="hidden items-center sm:flex">{@render actions()}</span>
  </div>
  {#if open}
    <div id="{id}-fields" class="flex flex-col gap-3 border-t border-surface-chip bg-surface-panel p-3.5">
      <StepFields bind:step {errors} />
      <div class="flex justify-end gap-1 sm:hidden">{@render actions()}</div>
    </div>
  {/if}
</div>
