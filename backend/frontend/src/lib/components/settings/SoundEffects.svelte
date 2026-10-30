<script lang="ts">
  // Settings' Sounds: every sound effect a match plays, at one volume (set on each device; the
  // caller has its own). Which ones play follows your account. With progression on, darts can play
  // sound packs instead of the beeps: each thrower's own, or one of yours (or the beeps) for everyone
  // (sounds.anyPack: any pack, locked or not).
  import SettingsCard from '$lib/components/settings/SettingsCard.svelte'
  import { parseSettings, type GameSettings } from '$lib/gameSettings.js'
  import { createSounds } from '$lib/sounds.js'
  import { createSoundPacks, EACH_PACK as EACH, packOptions, SOUND_PACKS } from '$lib/soundPacks'
  import { flag } from '$lib/flags'
  import { progress } from '$lib/progress/store'
  import SettingSwitch from '$lib/components/SettingSwitch.svelte'
  import { Input } from '$lib/components/ui/input/index.js'
  import Select from '$lib/components/ui/select/select.svelte'
  import VolumeSlider from './VolumeSlider.svelte'

  let { settings = $bindable(), packs = false }: { settings: GameSettings; packs?: boolean } = $props()

  const sounds = [
    { key: 'soundHit', label: 'Hit', beep: 'hit', dart: 'hit' },
    { key: 'soundTreble', label: 'Treble', sub: 'Off: trebles play the hit sound', beep: 'treble', dart: 'treble' },
    { key: 'soundMiss', label: 'Miss', beep: 'miss', dart: 'miss' },
    { key: 'soundSwitch', label: 'Player switch', beep: 'switchPlayer' },
    { key: 'soundBust', label: 'Bust', beep: 'bust', dart: 'bust' },
  ] as const

  let trebleInput = $state<HTMLInputElement | null>(null)
  const anyPack = flag('sounds.anyPack')
  const options = $derived(packOptions($progress?.perks.unlocked ?? [], $anyPack, settings.soundPack))
  const preview = createSoundPacks(() => settings.effectsVolume)
  const beeps = createSounds(() => settings.effectsVolume)
  /** Plays what a match would for this row: the chosen pack's sound, else the beep. */
  function playRow(row: (typeof sounds)[number]) {
    const pack = packs ? settings.soundPack : null
    // 'sound.none' is the default: the beeps
    if (pack && pack in SOUND_PACKS && 'dart' in row) preview.play(pack, row.dart)
    else beeps[row.beep]()
    // How long it rings: the bust and the switch jingle run longer than a hit
    return row.key === 'soundBust' || row.key === 'soundSwitch' ? 0.9 : 0.5
  }
  function pickPack(v: string) {
    settings.soundPack = v === EACH ? null : v
  }
</script>

<SettingsCard
  id="sound-effects"
  title="Sound effects"
  description="Volume is set on each device and plays quieter while the caller speaks; the switches follow your account."
  class="gap-5 max-w-[720px]"
>
  <VolumeSlider bind:value={settings.effectsVolume} label="Effects volume" />
  {#if packs}
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="flex flex-col gap-[2px]">
        <span id="pref-soundPack" class="text-[15px]">Sound pack for every dart</span>
        <span class="text-[13px] text-text-dim">Yours for every player on this screen, or each thrower's own</span>
      </div>
      <Select {options} value={settings.soundPack ?? EACH} onchange={pickPack} label="Sound pack for every dart" />
    </div>
  {/if}
  <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
    {#each sounds as row (row.key)}
      <SettingSwitch
        id="pref-{row.key}"
        label={row.label}
        sub={'sub' in row ? row.sub : undefined}
        bind:checked={settings[row.key]}
        onpreview={() => playRow(row)}
      />
    {/each}
  </div>
  {#if settings.soundTreble}
    <div class="flex items-center justify-between gap-4">
      <label for="pref-trebleAbove" class="flex flex-col gap-[2px]">
        <span class="text-[15px] text-text">Treble sound above</span>
        <span class="text-[13px] text-text-dim">Smaller trebles play the hit sound. 0: every treble</span>
      </label>
      <Input
        id="pref-trebleAbove"
        type="number"
        min={0}
        max={19}
        class="w-20"
        value={settings.trebleAbove}
        bind:ref={trebleInput}
        onchange={() => (settings = parseSettings({ ...settings, trebleAbove: trebleInput?.valueAsNumber }))}
      />
    </div>
  {/if}
</SettingsCard>
