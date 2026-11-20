<script lang="ts">
  // The host's cog on a person's row: their own start score, check-in and check-out for the next
  // X01 game. Only what differs from the game's own rules is sent; Reset clears it.
  import { Settings } from '@lucide/svelte'
  import type { LobbyPerson } from '$lib/api/lobby-ws'
  import type { Handicap, X01Rules } from '$shared/handicap'
  import SegmentedControl from '$lib/components/SegmentedControl.svelte'
  import { Button } from '$lib/components/ui/button/index.js'
  import { handicapPatch } from '$lib/lobby/rules'
  import Popover from './Popover.svelte'
  import PopoverPanel from './PopoverPanel.svelte'

  let {
    person,
    rules,
    onsave,
  }: {
    person: LobbyPerson
    /** The next game's own rules. */
    rules: X01Rules
    onsave: (handicap: Handicap | null) => Promise<boolean>
  } = $props()

  const startOptions = [101, 301, 501, 701, 1001].map(v => ({ value: v, label: String(v) }))
  const inOutOptions = [
    { value: 'straight' as const, label: 'Straight' },
    { value: 'double' as const, label: 'Double' },
    { value: 'master' as const, label: 'Master' },
  ]

  let draft = $state<X01Rules>({ startScore: 501, inMode: 'straight', outMode: 'double' })
  const save = async (handicap: Handicap | null, close: () => void) => {
    if (await onsave(handicap)) close()
  }
</script>

<Popover
  triggerLabel="Handicap for {person.name}"
  haspopup="dialog"
  triggerClass="w-9 h-11 md:h-9 flex items-center justify-center bg-transparent border-0 md:border md:border-solid md:border-line-chip rounded-sm {person.handicap
    ? 'text-accent'
    : 'text-text-muted'}"
  onopen={() => (draft = { ...rules, ...person.handicap })}
>
  {#snippet trigger()}<Settings size={18} />{/snippet}
  {#snippet panel(close: () => void)}
    <PopoverPanel label="Handicap for {person.name}" role="dialog" align="right" width={320}>
      <div class="flex flex-col gap-3 p-2">
        <p class="text-small font-semibold">Handicap · {person.name}</p>
        <fieldset class="border-0 flex flex-col gap-2">
          <legend class="field-label mb-2">Start score</legend>
          <SegmentedControl options={startOptions} bind:value={draft.startScore} defaultValue={rules.startScore} />
        </fieldset>
        <fieldset class="border-0 flex flex-col gap-2">
          <legend class="field-label mb-2">Check-in</legend>
          <SegmentedControl options={inOutOptions} bind:value={draft.inMode} defaultValue={rules.inMode} />
        </fieldset>
        <fieldset class="border-0 flex flex-col gap-2">
          <legend class="field-label mb-2">Check-out</legend>
          <SegmentedControl options={inOutOptions} bind:value={draft.outMode} defaultValue={rules.outMode} />
        </fieldset>
        <div class="flex justify-end gap-2">
          <Button variant="ghost" size="sm" disabled={!person.handicap} onclick={() => void save(null, close)}>Reset</Button>
          <Button size="sm" onclick={() => void save(handicapPatch(rules, draft), close)}>Save</Button>
        </div>
      </div>
    </PopoverPanel>
  {/snippet}
</Popover>
