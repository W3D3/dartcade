<script lang="ts">
  // Settings' Game preferences (Settings-Game board): the same per-device switches as a match's
  // game settings drawer. Only rows with a setting behind them; New game defaults wait for
  // account-wide storage (#166).
  import type { GameSettings } from '$lib/gameSettings.js'
  import SettingSwitch from '$lib/components/SettingSwitch.svelte'
  import VolumeSlider from './VolumeSlider.svelte'

  let { settings = $bindable() }: { settings: GameSettings } = $props()

  const during = [
    { key: 'checkoutSuggestions', label: 'Checkout suggestions', sub: 'In the dart slots when you can finish' },
    { key: 'visitSum', label: 'Visit sum', sub: 'Big total of the current visit' },
    { key: 'chalkboard', label: 'Chalkboard', sub: 'Scored and left for every visit this leg' },
    { key: 'showMarkers', label: "Other players' targets", sub: 'Around the Clock: their next number on the board' },
  ] as const
  const sounds = [
    { key: 'soundHit', label: 'Hit' },
    { key: 'soundMiss', label: 'Miss' },
    { key: 'soundSwitch', label: 'Player switch' },
    { key: 'soundBust', label: 'Bust' },
    { key: 'soundWin', label: 'Win' },
  ] as const
</script>

<div class="grid grid-cols-1 xl:grid-cols-2 gap-4 md:gap-5 items-start">
  <section aria-labelledby="during-games" class="box-border p-4 md:p-[22px] card flex flex-col">
    <h2 id="during-games" class="m-0 text-[17px] font-semibold">During games</h2>
    <p class="m-0 mt-1 mb-[14px] text-[13px] leading-[1.5] text-text-dim">
      Saved on this device. A match's game settings change the same switches.
    </p>
    {#each during as row (row.key)}
      <div class="py-[14px] border-t border-line-2">
        <SettingSwitch id="pref-{row.key}" label={row.label} sub={row.sub} bind:checked={settings[row.key]} />
      </div>
    {/each}
  </section>

  <section aria-labelledby="sound-effects" class="box-border p-4 md:p-[22px] card flex flex-col gap-4">
    <h2 id="sound-effects" class="m-0 text-[17px] font-semibold">Sound effects</h2>
    <VolumeSlider bind:value={settings.volume} />
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
      {#each sounds as row (row.key)}
        <SettingSwitch id="pref-{row.key}" label={row.label} bind:checked={settings[row.key]} />
      {/each}
    </div>
  </section>
</div>
