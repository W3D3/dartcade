<script lang="ts">
  // Settings' Game preferences (Settings-Game board): the account-wide switches a match's game
  // settings drawer also changes (on that device only), and X01's New game defaults for the Play
  // page, offered with X01's own options. Only rows with a setting behind them.
  import { parseSettings, type GameSettings } from '$lib/gameSettings.js'
  import { gameModes } from '$lib/gameModes'
  import SettingSwitch from '$lib/components/SettingSwitch.svelte'
  import SegmentedControl from '$lib/components/SegmentedControl.svelte'
  import Stepper from '$lib/components/Stepper.svelte'

  let { settings = $bindable() }: { settings: GameSettings } = $props()

  const during = [
    { key: 'checkoutSuggestions', label: 'Checkout suggestions', sub: 'In the dart slots when you can finish' },
    { key: 'visitSum', label: 'Visit sum', sub: 'Big total of the current visit' },
    { key: 'chalkboard', label: 'Chalkboard', sub: 'Scored and left for every visit this leg' },
    { key: 'showMarkers', label: "Other players' targets", sub: 'Around the Clock: their next number on the board' },
  ] as const

  // X01's own options (from the backend); the card waits for them
  const x01 = $derived($gameModes.find(g => g.id === 'x01')?.configMeta)
  const THROW_ORDER: Record<string, string> = { off: 'Lobby order', wdc: 'Bull off · WDC', pdc: 'Bull off · PDC' }
  // The controls hand back plain values: the settings' own checks keep only valid ones
  const set = (key: 'x01StartScore' | 'x01OutMode' | 'x01FirstTo' | 'x01BullOff', v: unknown) =>
    (settings = parseSettings({ ...settings, [key]: v }))
</script>

<div class="grid grid-cols-1 xl:grid-cols-2 gap-4 md:gap-5 items-start">
  <section aria-labelledby="during-games" class="box-border p-4 md:p-[22px] card flex flex-col">
    <h2 id="during-games" class="m-0 text-[17px] font-semibold">During games</h2>
    <p class="m-0 mt-1 mb-[14px] text-[13px] leading-[1.5] text-text-dim">
      Your defaults on every board. Changing one in a game's settings applies to that board only.
    </p>
    {#each during as row (row.key)}
      <div class="py-[14px] border-t border-line-2">
        <SettingSwitch id="pref-{row.key}" label={row.label} sub={row.sub} bind:checked={settings[row.key]} />
      </div>
    {/each}
  </section>

  <div class="flex flex-col gap-4 md:gap-5">
    {#if x01}
      <section aria-labelledby="new-game-defaults" class="box-border p-4 md:p-[22px] card flex flex-col gap-4">
        <div class="flex flex-col gap-1">
          <h2 id="new-game-defaults" class="m-0 text-[17px] font-semibold">New game defaults</h2>
          <p class="m-0 text-[13px] leading-[1.5] text-text-dim">Pre-filled on Play for X01. You can still change them per game.</p>
        </div>
        <fieldset class="m-0 p-0 border-0 flex flex-col gap-2">
          <legend class="mb-2 text-[15px] text-text-muted">X01 start score</legend>
          <SegmentedControl options={x01.startScore.options ?? []} value={settings.x01StartScore} onchange={v => set('x01StartScore', v)} />
        </fieldset>
        <fieldset class="m-0 p-0 border-0 flex flex-col gap-2">
          <legend class="mb-2 text-[15px] text-text-muted">Check-out</legend>
          <SegmentedControl options={x01.outMode.options ?? []} value={settings.x01OutMode} onchange={v => set('x01OutMode', v)} />
        </fieldset>
        <div class="flex justify-between items-center">
          <span class="text-[15px] text-text-muted">First to</span>
          <Stepper value={settings.x01FirstTo} label="legs" unit={n => (n === 1 ? 'leg' : 'legs')} onchange={n => set('x01FirstTo', n)} />
        </div>
        <fieldset class="m-0 p-0 border-0 flex flex-col gap-2">
          <legend class="mb-2 text-[15px] text-text-muted">Throw order</legend>
          <SegmentedControl
            options={(x01.bullOff.options ?? []).map(o => ({ ...o, label: THROW_ORDER[String(o.value)] ?? o.label }))}
            value={settings.x01BullOff}
            onchange={v => set('x01BullOff', v)}
          />
        </fieldset>
      </section>
    {/if}
  </div>
</div>
