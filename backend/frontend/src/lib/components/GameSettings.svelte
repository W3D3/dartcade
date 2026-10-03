<script lang="ts">
  // A game mode's settings (the Play page's setup, the lobby's next-game card): X01's start
  // score, check-in, check-out, bull off, bull value, max rounds and first to; Around the
  // Clock's fields as the backend describes them. Bull off also drives the lobby's throw
  // order (the server keeps them in sync): picking WDC/PDC here turns the throw order to
  // Bull-off, and picking Off there turns this back off.
  import SegmentedControl from '$lib/components/SegmentedControl.svelte'
  import Stepper from '$lib/components/Stepper.svelte'
  import Tooltip from '$lib/components/Tooltip.svelte'
  import type { ConfigFieldMeta } from '$lib/api'
  import { GAME_MODES } from '$lib/gameModes'

  let { gameId, config, defaults, meta, teams = false, readonly = false, onchange }: {
    gameId: string
    /** The settings shown: the saved ones over the mode's defaults. */
    config: Record<string, unknown>
    /** The mode's defaults: a setting that differs is highlighted. */
    defaults: Record<string, unknown>
    /** The backend's labels and options per field (Around the Clock's form is built from them). */
    meta: Partial<Record<string, ConfigFieldMeta>>
    /** The game can be played in teams: shows the Format field (Singles / Teams). */
    teams?: boolean
    /** A member sees exactly what's set, but can't change it: every control is disabled, and
     * nothing here calls onchange. */
    readonly?: boolean
    onchange?: (key: string, value: unknown) => void
  } = $props()

  function set(key: string, value: unknown) {
    if (!readonly) onchange?.(key, value)
  }

  const startScoreOptions = [
    { value: 301, label: '301' },
    { value: 501, label: '501' },
    { value: 701, label: '701' },
  ]
  const inOutOptions = [
    { value: 'straight', label: 'Straight' },
    { value: 'double',   label: 'Double'   },
    { value: 'master',   label: 'Master'   },
  ]
  const bullOffOptions = [
    { value: 'off', label: 'Off' },
    { value: 'wdc', label: 'WDC', tooltip: 'Re-throw if both darts land in the same scoring area (both outer bull or both inner bull).' },
    { value: 'pdc', label: 'PDC', tooltip: 'Inner bull always beats outer bull. Re-throw only if both hit the inner bull.' },
  ]
  const bullValueOptions = [
    { value: '25_50', label: '25 / 50' },
    { value: '50_50', label: '50 / 50' },
  ]

  // ATC config fields in display order — populated from backend configMeta
  const ATC_FIELD_ORDER = ['finishOn', 'order', 'multiplierAdvances', 'throwAgainOnAllHit'] as const

  // A numeric config field, or its default when missing or not a number
  const num = (v: unknown, d: number) => (typeof v === 'number' ? v : d)
  const isNonDefault = (key: string) => key in defaults && config[key] !== defaults[key]
</script>

{#if gameId === 'x01'}
  <div class="flex flex-col gap-[18px]">
    {#if teams && meta.format}
      <fieldset class="m-0 p-0 border-0 flex flex-col gap-2">
        <legend class="flex items-center gap-2 text-[14px] font-medium text-[#d8d8ce] mb-2">
          {meta.format.label}
          {#if meta.format.tooltip}
            <Tooltip text={meta.format.tooltip} />
          {/if}
        </legend>
        <SegmentedControl options={meta.format.options ?? []} value={config.format} disabled={readonly}
          defaultValue={defaults.format} onchange={(v) => set('format', v)} />
      </fieldset>
    {/if}

    <fieldset class="m-0 p-0 border-0 flex flex-col gap-2">
      <legend class="text-[14px] font-medium text-[#d8d8ce] mb-2">Start score</legend>
      <SegmentedControl options={startScoreOptions} value={config.startScore} disabled={readonly}
        defaultValue={defaults.startScore} onchange={(v) => set('startScore', v)} />
    </fieldset>

    <fieldset class="m-0 p-0 border-0 flex flex-col gap-2">
      <legend class="text-[14px] font-medium text-[#d8d8ce] mb-2">Check-in</legend>
      <SegmentedControl options={inOutOptions} value={config.inMode} disabled={readonly}
        defaultValue={defaults.inMode} onchange={(v) => set('inMode', v)} />
    </fieldset>

    <fieldset class="m-0 p-0 border-0 flex flex-col gap-2">
      <legend class="text-[14px] font-medium text-[#d8d8ce] mb-2">Check-out</legend>
      <SegmentedControl options={inOutOptions} value={config.outMode} disabled={readonly}
        defaultValue={defaults.outMode} onchange={(v) => set('outMode', v)} />
    </fieldset>

    <fieldset class="m-0 p-0 border-0 flex flex-col gap-2">
      <legend class="flex items-center gap-2 text-[14px] font-medium text-[#d8d8ce] mb-2">
        Bull off
        <Tooltip text="Throw one dart each to decide who goes first. Closest to bull wins." />
      </legend>
      <SegmentedControl options={bullOffOptions} value={config.bullOff} disabled={readonly}
        defaultValue={defaults.bullOff} onchange={(v) => set('bullOff', v)} />
    </fieldset>

    <fieldset class="m-0 p-0 border-0 flex flex-col gap-2">
      <legend class="text-[14px] font-medium text-[#d8d8ce] mb-2">Bull value</legend>
      <SegmentedControl options={bullValueOptions} value={config.bullValue} disabled={readonly}
        defaultValue={defaults.bullValue} onchange={(v) => set('bullValue', v)} />
    </fieldset>

    <div class="flex justify-between items-center">
      <span class="flex items-center gap-2 text-[14px] font-medium text-[#d8d8ce]">Max rounds <Tooltip text="Maximum number of rounds before the game ends. The player with the lowest score wins if nobody checks out. Set higher for longer games." /></span>
      <Stepper value={num(config.maxRounds, 50)} label="rounds" highlight={isNonDefault('maxRounds')} disabled={readonly}
        onchange={(n) => set('maxRounds', n)} />
    </div>

    <div class="flex justify-between items-center">
      <span class="text-[14px] font-medium text-[#d8d8ce]">First to</span>
      <Stepper value={num(config.firstTo, 3)} label="legs" unit={(n) => (n === 1 ? 'leg' : 'legs')} highlight={isNonDefault('firstTo')} disabled={readonly}
        onchange={(n) => set('firstTo', n)} />
    </div>
  </div>

{:else if gameId === 'atc'}
  <div class="flex flex-col gap-[18px]">
    {#each ATC_FIELD_ORDER as fieldKey (fieldKey)}
      {@const field = meta[fieldKey]}
      {#if field?.options}
        <fieldset class="m-0 p-0 border-0 flex flex-col gap-2">
          <legend class="flex items-center gap-2 text-[14px] font-medium text-[#d8d8ce] mb-2">
            {field.label}
            {#if field.tooltip}
              <Tooltip text={field.tooltip} />
            {/if}
          </legend>
          <SegmentedControl
            options={field.options}
            value={config[fieldKey]}
            defaultValue={defaults[fieldKey]}
            disabled={readonly}
            onchange={(v: unknown) => set(fieldKey, v)} />
        </fieldset>
      {/if}
    {/each}
  </div>

{:else}
  <div class="p-4 border border-dashed border-[#3e4239] rounded-[10px] text-[14px]
              leading-[1.5] text-text-muted">
    [{GAME_MODES.find(m => m.id === gameId)?.name ?? gameId} options — rules and settings to be defined]
  </div>
{/if}
