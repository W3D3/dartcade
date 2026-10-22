<script lang="ts">
  // Settings' Caller: the sound packs on the match screen, on or off, and their volume. Set on each
  // device. Each dart plays its thrower's pack (a progression reward; Customise on your profile).
  import type { GameSettings } from '$lib/gameSettings.js'
  import { audioContext } from '$lib/sounds.js'
  import SettingSwitch from '$lib/components/SettingSwitch.svelte'
  import VolumeSlider from './VolumeSlider.svelte'

  let { settings = $bindable() }: { settings: GameSettings } = $props()
</script>

<section aria-labelledby="sound-effects" class="box-border p-4 md:p-[22px] card flex flex-col gap-5">
  <div class="flex flex-col gap-1">
    <h2 id="sound-effects" class="m-0 text-[17px] font-semibold">Sound effects</h2>
    <p class="m-0 text-[13px] leading-[1.5] text-text-dim">
      Darts play the thrower's sound pack, quieter while the caller speaks. Set on this device.
    </p>
  </div>
  <SettingSwitch
    id="pref-soundEffects"
    label="Sound packs"
    sub="Hits, trebles, misses and busts"
    bind:checked={settings.soundEffects}
    onchange={() => {
      audioContext()
    }}
  />
  {#if settings.soundEffects}
    <VolumeSlider bind:value={settings.effectsVolume} label="Effects volume" />
  {/if}
</section>
