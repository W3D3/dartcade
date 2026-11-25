<script lang="ts">
  // Edit rule (Settings-Lights-Rules): when it fires (trigger, visit total, seat, game), Scene or
  // Flash, and its look: a colour and effect (the effects your devices report), a preset or a
  // playlist saved on your strip, Dartcade's own presets, or raw WLED JSON checked against the
  // keys a light may set. Test on board plays it as it stands, saved or not; Save hands the rule
  // back. Closing with changes asks first.
  import { Button } from '$lib/components/ui/button/index.js'
  import { Modal } from '$lib/components/ui/modal/index.js'
  import { Select } from '$lib/components/ui/select/index.js'
  import { Slider } from '$lib/components/ui/slider/index.js'
  import SegmentedControl from '$lib/components/SegmentedControl.svelte'
  import ErrorText from '$lib/components/ErrorText.svelte'
  import type { LightRule, WledDevice } from '$lib/api'
  import { PRESETS, STRIP_PRESET_IDS, TRIGGER_GAME } from '$shared/lights/index.js'
  import { gameTitle } from '$shared/gameNames.js'
  import { lookSwatches } from '$lib/lights/view'
  import {
    describeRule,
    effectChoices,
    formOf,
    GAME_OPTIONS,
    hasSeat,
    HOLD_RANGE,
    missingHint,
    OP_OPTIONS,
    paletteChoices,
    ruleOf,
    SEAT_OPTIONS,
    TRIGGER_OPTIONS,
    type ColorMode,
    type LookTab,
    type RuleForm,
  } from '$lib/lights/rules'

  let {
    rule,
    profileName,
    position,
    count,
    devices,
    seatColors,
    canTest,
    testError = null,
    testPlaying = false,
    ontest,
    onsave,
    ondelete,
    onclose,
  }: {
    rule: LightRule
    profileName: string
    /** The rule's number in the profile, from 1. */
    position: number
    count: number
    devices: WledDevice[]
    seatColors: readonly string[]
    canTest: boolean
    testError?: string | null
    /** The last test is playing on the board. */
    testPlaying?: boolean
    ontest: (rule: LightRule) => void
    /** Resolves to the problem to show, or null once saved. */
    onsave: (rule: LightRule) => Promise<string | null>
    /** Only for a rule already in the profile. */
    ondelete?: () => void
    onclose: () => void
  } = $props()

  // The form starts from the rule it was opened with; later polls of the page don't reset it
  // svelte-ignore state_referenced_locally
  const initial = formOf(rule)
  let form = $state<RuleForm>(structuredClone(initial))
  const dirty = $derived(JSON.stringify(form) !== JSON.stringify(initial))
  const result = $derived(ruleOf(form))
  const draft = $derived('rule' in result ? result.rule : null)
  let confirmDiscard = $state(false)
  let saveError = $state<string | null>(null)
  let busy = $state(false)

  const effects = $derived(effectChoices(devices, form.fx))
  const palettes = $derived(paletteChoices(devices, form.pal))
  const pickedEffect = $derived(effects.choices.find(c => c.id === form.fx))
  const effectName = (fx: number) => effects.choices.find(c => c.id === fx)?.name ?? `Effect ${fx}`
  const paletteName = (pal: number) => palettes.choices.find(c => c.id === pal)?.name ?? `Palette ${pal}`
  const gameOfTrigger = $derived(TRIGGER_GAME[form.trigger])
  const swatches = $derived(draft ? lookSwatches(draft.look, seatColors) : [])
  const led = $derived(swatches[0] ?? '#3a3e36')

  const TYPE_OPTIONS = [
    { value: 'scene' as const, label: 'Scene · stays' },
    { value: 'flash' as const, label: 'Flash · plays on top' },
  ]
  const LOOK_OPTIONS: { value: LookTab; label: string }[] = [
    { value: 'color', label: 'Colour & effect' },
    { value: 'preset', label: 'WLED preset' },
    { value: 'playlist', label: 'Playlist' },
    { value: 'raw', label: 'Raw JSON' },
  ]
  const PRESET_SOURCES = [
    { value: 'strip' as const, label: 'Saved on your strip' },
    { value: 'dartcade' as const, label: "Dartcade's own" },
  ]
  const COLOR_MODES: { value: ColorMode; label: string }[] = [
    { value: 'seat', label: 'Seat colour' },
    { value: 'team', label: 'Team colour' },
    { value: 'fixed', label: 'Fixed' },
  ]
  const modeSwatch = (m: ColorMode) =>
    m === 'fixed' ? form.fixed : `linear-gradient(90deg, ${seatColors[0]}, ${seatColors[m === 'seat' ? 2 : 1]})`

  function close() {
    if (dirty) confirmDiscard = true
    else onclose()
  }

  async function save() {
    if (!draft) return
    busy = true
    saveError = await onsave(draft)
    busy = false
  }

  // Leaving the page with an unsaved rule asks too
  $effect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  })

  /** The option's own typed value for what the Select reports. */
  const pick = <T extends string>(options: readonly { value: T }[], v: string): T | undefined => options.find(o => o.value === v)?.value
  const numberValue = (e: Event & { currentTarget: HTMLInputElement }) => Math.round(Number(e.currentTarget.value))
</script>

<Modal
  onclose={close}
  title={ondelete ? 'Edit rule' : 'Add rule'}
  subtitle="{profileName} profile · rule {position} of {count}"
  widthClass="max-w-[640px]"
>
  <!-- When: the trigger, the visit total, whose seat, which game -->
  <fieldset class="flex flex-wrap items-center gap-2 p-[10px_12px] rounded-md bg-bg border border-line-2 text-label">
    <legend class="sr-only">When</legend>
    <span class="text-text-dim">When</span>
    <Select
      label="Trigger"
      options={TRIGGER_OPTIONS}
      value={form.trigger}
      onchange={(v: string) => (form.trigger = pick(TRIGGER_OPTIONS, v) ?? form.trigger)}
      class="h-9 min-w-[170px]"
    />
    {#if form.trigger === 'visit'}
      <Select
        label="Visit total"
        options={OP_OPTIONS}
        value={form.op}
        onchange={(v: string) => (form.op = pick(OP_OPTIONS, v) ?? form.op)}
        class="h-9 min-w-[96px]"
      />
      {#if form.op !== 'any'}
        <input
          type="number"
          min="0"
          max="180"
          aria-label={form.op === 'between' ? 'From total' : 'Total'}
          value={form.n}
          oninput={e => (form.n = numberValue(e))}
          class="w-[72px] h-9 px-2 rounded-sm border border-line-3 bg-transparent font-mono text-small"
        />
        {#if form.op === 'between'}
          <span class="text-text-dim">and</span>
          <input
            type="number"
            min="0"
            max="180"
            aria-label="To total"
            value={form.to}
            oninput={e => (form.to = numberValue(e))}
            class="w-[72px] h-9 px-2 rounded-sm border border-line-3 bg-transparent font-mono text-small"
          />
        {/if}
      {/if}
    {/if}
    {#if hasSeat(form.trigger)}
      <span class="text-text-dim">on</span>
      <Select
        label="Whose seat"
        options={SEAT_OPTIONS}
        value={form.seats}
        onchange={(v: string) => (form.seats = pick(SEAT_OPTIONS, v) ?? form.seats)}
        class="h-9 min-w-[150px]"
      />
    {/if}
    {#if gameOfTrigger}
      <span class="ml-auto text-caption text-text-dim">{gameTitle(gameOfTrigger)}</span>
    {:else}
      <Select
        label="Game"
        options={GAME_OPTIONS}
        value={form.game}
        onchange={(v: string) => (form.game = pick(GAME_OPTIONS, v) ?? form.game)}
        class="h-9 min-w-[130px] md:ml-auto"
      />
    {/if}
  </fieldset>

  <div class="flex flex-col gap-[6px]">
    <span id="rule-type" class="text-caption font-semibold text-text-muted">Type</span>
    <SegmentedControl labelledby="rule-type" options={TYPE_OPTIONS} bind:value={form.type} />
  </div>

  <div class="flex flex-col gap-[6px]">
    <span id="rule-look" class="text-caption font-semibold text-text-muted">Look</span>
    <SegmentedControl labelledby="rule-look" options={LOOK_OPTIONS} bind:value={form.look} class="flex-wrap" />
  </div>

  {#if form.look === 'color'}
    <div class="flex flex-col gap-[6px]">
      <span id="rule-colour" class="text-caption font-semibold text-text-muted">Colour</span>
      <div role="group" aria-labelledby="rule-colour" class="flex flex-wrap items-center gap-2">
        {#each COLOR_MODES as m (m.value)}
          <button
            type="button"
            aria-pressed={form.colorMode === m.value}
            onclick={() => (form.colorMode = m.value)}
            class="h-9 px-[10px] inline-flex items-center gap-[6px] rounded-sm bg-transparent text-text text-small cursor-pointer
                   {form.colorMode === m.value ? 'border-2 border-accent' : 'border border-line-3'}"
          >
            <span class="size-[14px] rounded-[4px]" style="background: {modeSwatch(m.value)}"></span>{m.label}
          </button>
        {/each}
        {#if form.colorMode === 'fixed'}
          <input
            type="color"
            aria-label="Fixed colour"
            value={form.fixed}
            oninput={e => (form.fixed = e.currentTarget.value)}
            class="w-[44px] h-9 p-0 border border-line-strong rounded-chip bg-transparent cursor-pointer"
          />
          <span class="type-mono-sm text-text-dim">{form.fixed}</span>
        {/if}
      </div>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-x-[18px] gap-y-[14px]">
      <div class="flex flex-col gap-[6px]">
        <span class="text-caption font-semibold text-text-muted"
          >Effect · {effects.fromDevices ? 'from your devices' : 'common WLED effects'}</span
        >
        <Select
          label="Effect"
          options={effects.choices.map(c => ({ value: String(c.id), label: `${c.name} #${c.id}` }))}
          value={String(form.fx)}
          onchange={(v: string) => (form.fx = Number(v))}
          class="h-10"
        />
        {#if missingHint(pickedEffect)}<span class="text-caption text-warn">{missingHint(pickedEffect)}</span>{/if}
      </div>
      <div class="flex flex-col gap-[6px]">
        <span class="text-caption font-semibold text-text-muted">Palette</span>
        <Select
          label="Palette"
          options={palettes.choices.map(c => ({ value: String(c.id), label: c.name }))}
          value={String(form.pal)}
          onchange={(v: string) => (form.pal = Number(v))}
          class="h-10"
        />
      </div>
      {#each [{ key: 'bri', label: 'Brightness' }, { key: 'speed', label: 'Effect speed' }, { key: 'ix', label: 'Intensity' }] as const as s (s.key)}
        <div class="flex flex-col gap-2">
          <span class="flex justify-between text-caption font-semibold text-text-muted"
            ><span id="rule-{s.key}">{s.label}</span><span class="font-mono text-text">{form[s.key]}</span></span
          >
          <Slider bind:value={form[s.key]} min={0} max={255} labelledby="rule-{s.key}" />
        </div>
      {/each}
    </div>
  {:else if form.look === 'preset'}
    <div class="flex flex-col gap-[10px]">
      <SegmentedControl label="Which preset" options={PRESET_SOURCES} bind:value={form.presetSource} />
      {#if form.presetSource === 'strip'}
        <label class="flex items-center gap-3 text-small">
          <span class="font-semibold">Preset id</span>
          <input
            type="number"
            min={STRIP_PRESET_IDS.min}
            max={STRIP_PRESET_IDS.max}
            value={form.ps}
            oninput={e => (form.ps = numberValue(e))}
            class="w-[90px] h-10 px-2 rounded-sm border border-line-3 bg-transparent font-mono"
          />
        </label>
        <span class="text-caption text-text-dim">
          Plays a preset you saved in WLED, by its number ({STRIP_PRESET_IDS.min}–{STRIP_PRESET_IDS.max}). Lights only play it; they never
          save or change your presets.
        </span>
      {:else}
        <Select
          label="Dartcade preset"
          options={Object.keys(PRESETS).map(p => ({ value: p, label: p }))}
          value={form.presetName}
          onchange={(v: string) => (form.presetName = v)}
          class="h-10"
        />
      {/if}
    </div>
  {:else if form.look === 'playlist'}
    <label class="flex items-center gap-3 text-small">
      <span class="font-semibold">Playlist id</span>
      <input
        type="number"
        min={STRIP_PRESET_IDS.min}
        max={STRIP_PRESET_IDS.max}
        value={form.pl}
        oninput={e => (form.pl = numberValue(e))}
        class="w-[90px] h-10 px-2 rounded-sm border border-line-3 bg-transparent font-mono"
      />
    </label>
    <span class="text-caption text-text-dim"
      >Starts a playlist you saved in WLED. It keeps running until the next scene, or the end of the flash.</span
    >
  {:else}
    <label class="flex flex-col gap-[6px]">
      <span class="text-caption font-semibold text-text-muted">WLED state (JSON)</span>
      <textarea
        bind:value={form.raw}
        rows="8"
        spellcheck="false"
        aria-describedby="rule-raw-help"
        class="p-3 rounded-sm border border-line-3 bg-bg font-mono text-caption/normal resize-y"></textarea>
    </label>
    <span id="rule-raw-help" class="text-caption text-text-dim">
      Sent as written. Allowed: on, bri, transition, mainseg, ps and seg with its look keys (col, fx, sx, ix, pal, …). Nothing that saves,
      deletes or reboots.
    </span>
  {/if}

  {#if form.type === 'flash'}
    <div class="flex flex-col gap-2 md:w-1/2 md:pr-[9px]">
      <span class="flex justify-between text-caption font-semibold text-text-muted"
        ><span id="rule-hold">Hold</span><span class="font-mono text-text">{(form.holdMs / 1000).toFixed(1)} s</span></span
      >
      <Slider bind:value={form.holdMs} min={HOLD_RANGE.min} max={HOLD_RANGE.max} step={HOLD_RANGE.step} labelledby="rule-hold" />
    </div>
  {/if}

  <div class="flex flex-col gap-2 p-3 rounded-lg bg-bg-deep">
    <div class="flex flex-wrap items-center gap-3">
      <span aria-hidden="true" class="flex grow gap-[2px] p-[3px] rounded-chip min-w-[160px]">
        {#each Array.from({ length: 24 }, (_, i) => i) as i (i)}
          {@const c = swatches.length ? swatches[i % swatches.length] : led}
          <span
            class="flex-1 h-[14px] rounded-bar"
            style="background: {c}; opacity: {form.look === 'color' ? Math.max(0.15, form.bri / 255) : 1}; box-shadow: 0 0 6px {c}66"
          ></span>
        {/each}
      </span>
      <Button variant="outline" size="sm" disabled={!canTest || !draft} onclick={() => draft && ontest(draft)}>▶ Test on board</Button>
    </div>
    {#if draft}
      <p role="status" class="text-caption text-text-muted">{describeRule(draft, effectName, paletteName)}</p>
    {/if}
    {#if !canTest}<span class="text-caption text-text-dim">Testing needs the lights on and the bridge online.</span>{/if}
    {#if testError}<ErrorText>{testError}</ErrorText>{/if}
    {#if testPlaying}<span role="status" class="text-caption font-semibold text-accent">▶ Playing on the board now</span>{/if}
  </div>

  {#if 'problems' in result}
    <ul class="pl-5 text-caption text-live-text flex flex-col gap-[2px]" aria-label="What to fix">
      {#each result.problems as p, i (i)}<li>{p}</li>{/each}
    </ul>
  {/if}
  {#if saveError}<ErrorText>{saveError}</ErrorText>{/if}

  {#if confirmDiscard}
    <div
      role="alertdialog"
      aria-label="Discard changes"
      class="flex flex-wrap items-center gap-3 p-3 rounded-md border border-line-3 bg-surface-2"
    >
      <span class="grow text-small font-semibold">Discard your changes to this rule?</span>
      <Button variant="outline" size="sm" onclick={() => (confirmDiscard = false)}>Keep editing</Button>
      <Button variant="destructive" size="sm" onclick={onclose}>Discard</Button>
    </div>
  {/if}

  {#snippet footer()}
    {#if ondelete}<Button variant="destructive" class="mr-auto" onclick={ondelete}>Delete rule</Button>{/if}
    <Button variant="outline" onclick={close}>Cancel</Button>
    <Button variant="accent" disabled={busy || !draft || (!dirty && !!ondelete)} onclick={() => void save()}>Save rule</Button>
  {/snippet}
</Modal>
