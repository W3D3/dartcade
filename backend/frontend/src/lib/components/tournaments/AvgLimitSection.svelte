<script lang="ts">
  // The create form's Average limit (Tournament-Create): limit who joins by their 30-day X01
  // average (between, at least, at most) on the Ø20+…Ø100+ scale, whether the organizer fits,
  // every player or the team average, the minimum legs and the lock. Online tournaments only.
  import { Check, X } from '@lucide/svelte'
  import AvgBadge from '$lib/components/AvgBadge.svelte'
  import SegmentedControl from '$lib/components/SegmentedControl.svelte'
  import { Input } from '$lib/components/ui/input/index.js'
  import FormSection from './FormSection.svelte'
  import SwitchRow from './SwitchRow.svelte'
  import type { CreateForm } from '$lib/tournaments/create'
  import { AVG_MODES, AVG_TEAMS, SCALE, fitsLine, loadForm, scalePercent, toAvgLimit, type AvgLimitForm } from '$lib/tournaments/avgLimit'
  import { AVG_LIMIT_RANGE, type Form } from '$shared/tournaments/avgLimit'

  let { n, form, locked, onchange }: { n: number; form: CreateForm; locked: boolean; onchange: (v: AvgLimitForm) => void } = $props()

  const v = $derived(form.avgLimit)
  const limit = $derived(toAvgLimit({ ...v, on: true }, true))
  let me = $state<Form | null>(null)
  $effect(() => void loadForm().then(f => (me = f)))
  const fits = $derived(limit && fitsLine(limit, form.entry === 'teams' ? form.playersPerTeam : 1, me))

  const set = <K extends keyof AvgLimitForm>(key: K, value: AvgLimitForm[K]) => onchange({ ...v, [key]: value })
  const seg = <T>(choices: { value: T; label: string }[]) => choices.map(c => ({ value: c.value, label: c.label }))
  /** A number field's value, or the old one while it is empty or not a number. */
  const numberOf = (e: Event & { currentTarget: HTMLInputElement }, old: number) =>
    Number.isFinite(e.currentTarget.valueAsNumber) ? e.currentTarget.valueAsNumber : old
</script>

{#if form.access !== 'in_person'}
  <FormSection {n} title="Average limit">
    <SwitchRow
      id="tc-avg-on"
      label="Limit who can join by average"
      help="Uses each player’s X01 3-dart average from the last 30 days."
      checked={v.on}
      disabled={locked}
      onchange={(on: boolean) => set('on', on)}
    />
    {#if v.on}
      <div class="flex flex-col gap-4 border-t border-surface-chip pt-3.5">
        <div class="grid items-end gap-3.5 md:grid-cols-[minmax(0,1.3fr)_1fr_1fr]">
          <div class="flex flex-col gap-2">
            <span id="tc-avg-mode" class="text-label font-semibold">Players can join if their average is</span>
            <SegmentedControl
              labelledby="tc-avg-mode"
              options={seg(AVG_MODES)}
              value={v.mode}
              disabled={locked}
              onchange={(m: AvgLimitForm['mode']) => set('mode', m)}
            />
          </div>
          {@render bound('min', 'Minimum', v.mode !== 'at_most')}
          {@render bound('max', 'Maximum', v.mode !== 'at_least')}
        </div>

        <div class="rounded-xl border border-surface-chip bg-surface-inset px-[30px] pt-[18px]">
          <div class="scale relative mt-1.5 mb-4 h-1.5 rounded-[3px]">
            {#if limit}
              <span
                class="absolute inset-y-[-5px] rounded-md border-2 border-accent bg-accent-tint"
                style="left:{limit.min === null ? 0 : scalePercent(limit.min)}%;right:{limit.max === null
                  ? 0
                  : 100 - scalePercent(limit.max)}%"
              ></span>
            {/if}
          </div>
          <div class="relative h-[30px]" aria-hidden="true">
            <!-- A phone has room for every other class -->
            {#each SCALE as s, i (s)}
              <span class="absolute -translate-x-1/2 {i % 2 ? 'max-md:hidden' : ''}" style="left:{scalePercent(s)}%"
                ><AvgBadge average={s} size="sm" /></span
              >
            {/each}
          </div>
        </div>

        {#if fits}
          <span class="flex items-center gap-1.5 text-label font-semibold {fits.fits ? 'text-accent' : 'text-text-muted'}">
            {#if fits.fits}<Check size={15} aria-hidden="true" />{:else}<X size={15} aria-hidden="true" />{/if}{fits.text}
          </span>
        {/if}

        <div class="grid gap-3.5 rounded-xl border border-accent-line bg-accent-tint/40 px-4 py-3.5 md:grid-cols-2">
          {#if form.entry === 'teams'}
            <div class="flex flex-col gap-2">
              <span id="tc-avg-teams" class="text-label font-semibold">For teams, check</span>
              <SegmentedControl
                labelledby="tc-avg-teams"
                options={seg(AVG_TEAMS)}
                value={v.teams}
                disabled={locked}
                onchange={(t: AvgLimitForm['teams']) => set('teams', t)}
              />
              <span class="text-caption text-text-dim">Team average = the average of the picked players’ 30-day averages.</span>
            </div>
          {/if}
          <label class="flex flex-col gap-2">
            <span class="text-label font-semibold">Minimum legs played</span>
            <span class="flex items-center gap-2">
              <Input
                type="number"
                min={0}
                max={AVG_LIMIT_RANGE.legsMax}
                step={1}
                value={v.minLegs}
                disabled={locked}
                oninput={(e: Event & { currentTarget: HTMLInputElement }) => set('minLegs', Math.round(numberOf(e, v.minLegs)))}
                class="w-24"
              />
              <span class="text-caption text-text-dim">legs in 30 days</span>
            </span>
            <span class="text-caption text-text-dim"
              >Players with fewer legs can’t join, so new or barely used accounts can’t slip into lower brackets.</span
            >
          </label>
        </div>

        <SwitchRow
          id="tc-avg-lock"
          label="Lock the average at registration"
          help="If on, players keep their spot when their average moves out of range before the start. If off, it’s checked again at check-in."
          checked={v.lock}
          disabled={locked}
          onchange={(on: boolean) => set('lock', on)}
        />
      </div>
    {/if}
  </FormSection>
{/if}

{#snippet bound(key: 'min' | 'max', label: string, shown: boolean)}
  <label class="flex flex-col gap-2 {shown ? '' : 'invisible'}">
    <span class="text-label font-semibold">{label}</span>
    <span class="flex items-center gap-2">
      <Input
        type="number"
        min={AVG_LIMIT_RANGE.min}
        max={AVG_LIMIT_RANGE.max}
        step={0.5}
        value={v[key]}
        disabled={locked || !shown}
        oninput={(e: Event & { currentTarget: HTMLInputElement }) => set(key, numberOf(e, v[key]))}
        class="w-24"
      />
      <span class="text-caption text-text-dim">3-dart avg</span>
    </span>
  </label>
{/snippet}

<style>
  /* The average classes' colours from Ø20 to Ø100 (Avg-Classes board) */
  .scale {
    background: linear-gradient(
      90deg,
      #3a3e36 0%,
      #c98a52 18%,
      #4fbf6a 31%,
      var(--color-accent) 37%,
      #4fd1c5 44%,
      #3fb6e8 50%,
      #6a8cff 56%,
      #9b7bff 62%,
      #d86bff 69%,
      #ff6b9a 75%,
      #ff8a4a 81%,
      #f2c14e 87%,
      #d59bff 100%
    );
  }
</style>
