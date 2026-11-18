<script lang="ts">
  // The create form's guest options (Tournament-Create, Entry): whether captains may fill a place
  // with someone who has no account, how many per team, and the average a guest counts as for the
  // average limit. Online teams only; official tournaments never take guests.
  import SegmentedControl from '$lib/components/SegmentedControl.svelte'
  import { Input } from '$lib/components/ui/input/index.js'
  import SwitchRow from './SwitchRow.svelte'
  import type { CreateForm } from '$lib/tournaments/create'
  import { GUEST_AVERAGE_RANGE } from '$shared/tournaments/guests'

  let { form, locked, onchange }: { form: CreateForm; locked: boolean; onchange: (v: Partial<CreateForm>) => void } = $props()

  const PER_TEAM: { value: CreateForm['guestsPerTeam']; label: string }[] = [
    { value: 1, label: 'Up to 1' },
    { value: null, label: 'Any' },
  ]
</script>

<div class="flex flex-col gap-3.5 border-t border-surface-chip pt-3.5">
  <SwitchRow
    id="tc-guests-on"
    label="Allow guest players"
    help="Guests have no account. They play on a registered player’s board, don’t need to confirm, and nothing is saved for them."
    checked={form.guestsOn}
    disabled={locked}
    onchange={(on: boolean) => onchange({ guestsOn: on })}
  />
  {#if form.guestsOn}
    <div class="grid gap-3.5 md:grid-cols-2">
      <div class="flex flex-col gap-2">
        <span id="tc-guests-per" class="text-label font-semibold">Guests per team</span>
        <SegmentedControl
          labelledby="tc-guests-per"
          options={PER_TEAM}
          value={form.guestsPerTeam}
          disabled={locked}
          onchange={(v: CreateForm['guestsPerTeam']) => onchange({ guestsPerTeam: v })}
        />
        <span class="text-caption text-text-dim">A team keeps at least one player with an account.</span>
      </div>
      <label class="flex flex-col gap-2">
        <span class="text-label font-semibold">Guest average counts as</span>
        <span class="flex items-center gap-2">
          <Input
            type="number"
            min={GUEST_AVERAGE_RANGE.min}
            max={GUEST_AVERAGE_RANGE.max}
            step={0.5}
            value={form.guestAverage}
            disabled={locked}
            oninput={(e: Event & { currentTarget: HTMLInputElement }) =>
              onchange({
                guestAverage: Number.isFinite(e.currentTarget.valueAsNumber) ? e.currentTarget.valueAsNumber : form.guestAverage,
              })}
            class="w-24"
          />
          <span class="text-caption text-text-dim">3-dart avg · for the average limit</span>
        </span>
        <span class="text-caption text-text-dim">Guests have no 30-day average, so the team average uses this value instead.</span>
      </label>
    </div>
  {/if}
</div>
