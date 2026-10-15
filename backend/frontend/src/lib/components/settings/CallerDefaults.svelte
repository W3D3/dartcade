<script lang="ts">
  // Settings' Caller: whether the caller is on, its voice and volume (Settings-Caller board). The
  // same per-device settings as a match's game settings drawer, so they can still change mid-game.
  import type { GameSettings } from '$lib/gameSettings.js'
  import { voiceLibrary } from '$lib/caller/voices.js'
  import { audioContext } from '$lib/sounds.js'
  import SettingSwitch from '$lib/components/SettingSwitch.svelte'
  import VoiceSelect from './VoiceSelect.svelte'
  import VolumeSlider from './VolumeSlider.svelte'

  let { settings = $bindable() }: { settings: GameSettings } = $props()
</script>

<section aria-labelledby="caller-defaults" class="box-border p-4 md:p-[22px] card flex flex-col gap-5">
  <div class="flex flex-col gap-1">
    <h2 id="caller-defaults" class="m-0 text-[17px] font-semibold">Caller defaults</h2>
    <p class="m-0 text-[13px] leading-[1.5] text-text-dim">
      Saved on this device. Caller on/off and the voice can still be changed mid-game.
    </p>
  </div>
  <SettingSwitch
    id="pref-callerOn"
    label="Caller"
    sub="Calls each visit in X01"
    bind:checked={settings.callerOn}
    onchange={() => {
      audioContext()
    }}
  />
  <div class="flex flex-col gap-2">
    <span id="pref-callerVoice" class="text-[15px] text-text-muted">Default voice</span>
    <VoiceSelect
      bind:value={settings.callerVoice}
      packs={$voiceLibrary.packs}
      builtins={$voiceLibrary.builtins}
      labelledby="pref-callerVoice"
      class="w-full"
    />
  </div>
  <VolumeSlider bind:value={settings.volume} label="Caller volume" />
  <p class="m-0 -mt-3 text-[12px] text-text-dim">The same volume as the sound effects.</p>
</section>
