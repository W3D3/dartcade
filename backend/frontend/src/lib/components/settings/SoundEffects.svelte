<script lang="ts">
  // Settings' Sounds: every sound effect a match plays, at one volume (set on each device; the
  // caller has its own). Which ones play follows your account; with progression on, each dart
  // can play its thrower's sound pack instead (a reward; Customise on your profile).
  import type { GameSettings } from '$lib/gameSettings.js'
  import { audioContext } from '$lib/sounds.js'
  import SettingSwitch from '$lib/components/SettingSwitch.svelte'
  import VolumeSlider from './VolumeSlider.svelte'

  let { settings = $bindable(), packs = false }: { settings: GameSettings; packs?: boolean } = $props()

  const sounds = [
    { key: 'soundHit', label: 'Hit' },
    { key: 'soundMiss', label: 'Miss' },
    { key: 'soundSwitch', label: 'Player switch' },
    { key: 'soundBust', label: 'Bust' },
    { key: 'soundWin', label: 'Win' },
  ] as const
</script>

<section aria-labelledby="sound-effects" class="box-border p-4 md:p-[22px] card flex flex-col gap-5 max-w-[720px]">
  <div class="flex flex-col gap-1">
    <h2 id="sound-effects" class="m-0 text-[17px] font-semibold">Sound effects</h2>
    <p class="m-0 text-[13px] leading-[1.5] text-text-dim">
      Volume is set on each device and plays quieter while the caller speaks; the switches follow your account.
    </p>
  </div>
  <VolumeSlider bind:value={settings.effectsVolume} label="Effects volume" />
  <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
    {#each sounds as row (row.key)}
      <SettingSwitch id="pref-{row.key}" label={row.label} bind:checked={settings[row.key]} />
    {/each}
  </div>
  {#if packs}
    <SettingSwitch
      id="pref-soundEffects"
      label="Sound packs"
      sub="Darts play the thrower's sound pack instead of the beeps"
      bind:checked={settings.soundEffects}
      onchange={() => {
        audioContext()
      }}
    />
  {/if}
</section>
