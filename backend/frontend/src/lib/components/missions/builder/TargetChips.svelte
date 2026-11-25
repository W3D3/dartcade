<!--
  A step's targets as chips (the builder's Targets field): tap one to cycle its ring (hit steps), × to
  take it out, Add target to pick a number or the bull. In order, arrows sit between the chips.
-->
<script lang="ts" generics="T extends string | number">
  import { Plus, X } from '@lucide/svelte'
  import { Popover } from 'bits-ui'
  import { BOARD_NUMBERS, numberLabel } from '$lib/missions/builder'

  let {
    targets,
    label,
    addLabel = 'Add target',
    inOrder = false,
    error,
    labelOf,
    cycle,
    taken,
    onadd,
    onchange,
  }: {
    targets: T[]
    label: string
    addLabel?: string
    inOrder?: boolean
    error?: string
    labelOf: (t: T) => string
    /** The target a tap turns it into; left out, the chip can't be tapped. */
    cycle?: (t: T) => T
    /** A number that can't be added again. */
    taken?: (n: number) => boolean
    onadd: (n: number) => void
    onchange: (targets: T[]) => void
  } = $props()

  let open = $state(false)
  const id = $props.id()
  const CHIP =
    'inline-flex h-7 items-center rounded-sm border border-accent-line bg-accent-tint pl-2.5 font-display text-body-lg font-bold text-accent'
</script>

<div class="flex min-w-0 flex-col gap-1.5">
  <span {id} class="text-label font-semibold">{label}</span>
  <div class="flex flex-wrap items-center gap-2" role="group" aria-labelledby={id}>
    {#each targets as t, i (`${i}-${t}`)}
      {#if inOrder && i > 0}<span aria-hidden="true" class="text-text-muted">→</span>{/if}
      <span class={CHIP}>
        {#if cycle}
          <button
            type="button"
            class="cursor-pointer border-0 bg-transparent p-0 text-inherit"
            aria-label="{labelOf(t)}: change ring"
            onclick={() => onchange(targets.map((x, j) => (j === i ? cycle(x) : x)))}>{labelOf(t)}</button
          >
        {:else}{labelOf(t)}{/if}
        <button
          type="button"
          class="ml-1 flex h-full cursor-pointer items-center border-0 bg-transparent px-1.5 text-accent/70 hover:text-accent"
          aria-label="Remove {labelOf(t)}"
          onclick={() => onchange(targets.filter((_, j) => j !== i))}><X size={13} /></button
        >
      </span>
    {/each}
    <Popover.Root bind:open>
      <Popover.Trigger
        class="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-sm border border-line-3 bg-surface-2 px-2.5 text-small font-semibold text-text"
        ><Plus size={14} />{addLabel}</Popover.Trigger
      >
      <Popover.Portal>
        <Popover.Content
          sideOffset={6}
          align="start"
          class="z-60 grid w-[264px] grid-cols-6 gap-1 rounded-xl border border-line-popover bg-surface-hover p-2 [box-shadow:0_18px_44px_rgba(0,0,0,0.55)]"
        >
          {#each BOARD_NUMBERS as n (n)}
            <button
              type="button"
              disabled={taken?.(n)}
              class="h-9 cursor-pointer rounded-sm border-0 bg-surface-chip text-label font-semibold text-text hover:bg-line disabled:cursor-not-allowed disabled:opacity-40
                     {n === 25 ? 'col-span-2' : ''}"
              onclick={() => {
                onadd(n)
                open = false
              }}>{numberLabel(n)}</button
            >
          {/each}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  </div>
  {#if cycle}<span class="text-caption text-text-dim">Tap a target to change single / double / treble / bull.</span>{/if}
  {#if error}<span class="text-caption text-danger-text">{error}</span>{/if}
</div>
