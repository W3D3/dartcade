<script lang="ts">
  // A player's own light profile (Settings-Lights-Rules): its rules in the order they match, the
  // first matching one winning. Each row: a grip to drag it (or arrow keys on the grip), the
  // trigger and its filter, Scene or Flash, the look with its colours, an on/off switch, Edit and
  // ▶ Test. + Add rule opens the editor on a new rule.
  import { Plus } from '@lucide/svelte'
  import { Button } from '$lib/components/ui/button/index.js'
  import { Switch } from '$lib/components/ui/switch/index.js'
  import DragHandle from '$lib/components/lobby/DragHandle.svelte'
  import ReorderStatus from '$lib/components/lobby/ReorderStatus.svelte'
  import { sortable, type SortableDrop } from '$lib/actions/sortable'
  import { listKeyMove, listPlacement, type Direction, type Placement } from '$lib/lobby/dnd'
  import { createReorder } from '$lib/lobby/reorder.svelte'
  import type { LightRule } from '$lib/api'
  import { lookSwatches, ruleLabel } from '$lib/lights/view'

  let {
    rules,
    seatColors,
    canTest,
    onmove,
    onenabled,
    onedit,
    onadd,
    ontest,
  }: {
    rules: LightRule[]
    seatColors: readonly string[]
    canTest: boolean
    /** Moves the rule at `from` to `to` (its place with it taken out); resolves to whether it was saved. */
    onmove: (from: number, to: number) => Promise<boolean>
    onenabled: (index: number, enabled: boolean) => void
    onedit: (index: number) => void
    onadd: () => void
    ontest: (index: number) => void
  } = $props()

  const hintId = 'light-rules-reorder'
  const items = $derived(
    rules.map((rule, index) => {
      const label = ruleLabel(rule)
      return { id: `rule-${index}`, index, rule, label, name: `rule ${index + 1}, ${label.when}${label.filter ? ` ${label.filter}` : ''}` }
    }),
  )
  const moves = createReorder(
    () => items,
    (id, placement) => onmove(Number(id.slice('rule-'.length)), placement.position),
  )
  const place = (id: string, placement: Placement) =>
    void moves.place(id, placement, (list, item) => `${item.label.when} moved to rule ${list.indexOf(item) + 1} of ${list.length}.`)
  const ondrop = ({ id, beforeId }: SortableDrop) => place(id, listPlacement(moves.people, id, beforeId))
  function onkey(id: string, dir: Direction) {
    const placement = listKeyMove(moves.people, id, dir)
    if (placement) place(id, placement)
  }

  const badge = (type: 'Scene' | 'Flash') => (type === 'Scene' ? 'bg-accent-tint text-accent' : 'bg-[#2b2410] text-[#f2c94c]')
</script>

<div class="flex flex-col gap-[10px]">
  <ReorderStatus id={hintId} hint="Arrow up or down moves a rule one place." announcement={moves.announcement} />
  {#if rules.length === 0}
    <p class="text-small text-text-muted px-[10px] py-3 rounded-md bg-surface-active">
      No rules yet, so the lights stay as they are. Add one, or reset the profile to the default rules.
    </p>
  {/if}
  <ol class="p-0 flex flex-col gap-1" data-sortable-zone="rules" use:sortable={{ ondrop, onkey, oncancel: () => moves.cancelled() }}>
    {#each moves.people as item, i (item.id)}
      {@const { label, rule } = item}
      {@const swatches = lookSwatches(rule.look, seatColors)}
      <li
        data-sortable-id={item.id}
        class="grid grid-cols-[32px_1fr_auto] md:grid-cols-[32px_minmax(140px,1fr)_52px_minmax(0,1.1fr)_auto_auto] items-center gap-x-[10px] gap-y-1
               min-h-11 pr-[10px] py-2 md:py-0 rounded-md bg-surface-active {label.enabled
          ? ''
          : '[&>*:not([role=switch]):not([data-sortable-handle])]:opacity-60'}"
      >
        <span class="row-span-2 md:row-span-1"><DragHandle name={item.name} describedby={hintId} /></span>

        <span class="col-start-2 row-start-1 flex items-center gap-[6px] min-w-0 text-small font-semibold">
          <span class="truncate" title={label.hint ?? undefined}>{label.when}</span>
          {#if label.filter}
            <span class="shrink-0 whitespace-nowrap type-mono-sm text-ink-2 px-[6px] py-[2px] rounded-[5px] bg-surface-key">
              {label.filter}
            </span>
          {/if}
        </span>
        <span
          class="col-start-2 row-start-2 md:col-start-3 md:row-start-1 justify-self-start h-[22px] px-[7px] rounded-chip text-micro font-bold leading-[22px] {badge(
            label.type,
          )}"
        >
          {label.type}
        </span>
        <span class="hidden md:flex md:col-start-4 md:row-start-1 items-center gap-2 min-w-0 text-caption text-text-muted">
          {#if swatches.length}
            <span class="flex pl-1" aria-hidden="true">
              {#each swatches as c, k (k)}
                <span class="size-[14px] rounded-[4px] -ml-1 shadow-[0_0_0_2px_var(--color-surface-1)]" style="background: {c}"></span>
              {/each}
            </span>
          {/if}
          <span class="truncate" title={label.look}>{label.look}</span>
        </span>

        <Switch
          size="sm"
          checked={rule.enabled}
          onCheckedChange={(on: boolean) => onenabled(item.index, on)}
          aria-label="{label.when}{label.filter ? ` ${label.filter}` : ''} on"
          class="col-start-3 row-start-1 md:col-start-5 justify-self-end"
        />
        <span class="col-start-3 row-start-2 md:col-start-6 md:row-start-1 flex gap-[6px] justify-self-end">
          <Button
            variant="outline"
            size="sm"
            class="h-8 px-2.5 text-caption"
            aria-label="Edit rule {i + 1}: {label.when}"
            onclick={() => onedit(item.index)}>Edit</Button
          >
          <Button
            variant="outline"
            size="sm"
            class="h-8 px-2.5 text-caption"
            disabled={!canTest}
            aria-label="Test rule {i + 1}: {label.when}{label.filter ? ` ${label.filter}` : ''}"
            onclick={() => ontest(item.index)}
          >
            ▶ Test
          </Button>
        </span>
      </li>
    {/each}
  </ol>
  <div><Button variant="outline" size="sm" onclick={onadd}><Plus size={14} />Add rule</Button></div>
  <span class="text-caption text-text-dim">
    The first matching rule wins, so keep specific rules (180) above general ones (100+). Drag to reorder.
  </span>
</div>
