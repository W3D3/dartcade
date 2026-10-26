<script lang="ts">
  // Settings' Sounds: every sound effect a match plays, at one volume (set on each device; the
  // caller has its own). Which ones play follows your account. With progression on, darts can play
  // sound packs instead of the beeps: each thrower's own, or one of yours (or the beeps) for everyone
  // (sounds.anyPack: any pack, locked or not).
  import SettingsCard from '$lib/components/settings/SettingsCard.svelte'
  import type { GameSettings } from '$lib/gameSettings.js'
  import { audioContext, createSounds } from '$lib/sounds.js'
  import { createSoundPacks, EACH_PACK as EACH, packOptions } from '$lib/soundPacks'
  import { flag } from '$lib/flags'
  import { progress } from '$lib/progress/store'
  import SettingSwitch from '$lib/components/SettingSwitch.svelte'
  import Select from '$lib/components/ui/select/select.svelte'
  import VolumeSlider from './VolumeSlider.svelte'

  let { settings = $bindable(), packs = false }: { settings: GameSettings; packs?: boolean } = $props()

  const sounds = [
    { key: 'soundHit', label: 'Hit', beep: 'hit', dart: 'hit' },
    { key: 'soundTreble', label: 'Treble', sub: 'Off: trebles play the hit sound', beep: 'treble', dart: 'treble' },
    { key: 'soundMiss', label: 'Miss', beep: 'miss', dart: 'miss' },
    { key: 'soundSwitch', label: 'Player switch', beep: 'switchPlayer' },
    { key: 'soundBust', label: 'Bust', beep: 'bust', dart: 'bust' },
    { key: 'soundWin', label: 'Win', beep: 'win' },
  ] as const

  const anyPack = flag('sounds.anyPack')
  const options = $derived(packOptions($progress?.perks.unlocked ?? [], $anyPack, settings.soundPack))
  const preview = createSoundPacks(() => settings.effectsVolume)
  const beeps = createSounds(() => settings.effectsVolume)
  // A row's button stays disabled while its sound rings (the longest recipes run under a second)
  let playing = $state<string | null>(null)
  let playingTimer: ReturnType<typeof setTimeout> | undefined
  /** Plays what a match would for this row: the chosen pack's sound, else the beep. */
  function playRow(row: (typeof sounds)[number]) {
    playing = row.key
    clearTimeout(playingTimer)
    playingTimer = setTimeout(() => (playing = null), row.key === 'soundBust' || row.key === 'soundWin' ? 900 : 500)
    const pack = packs && settings.soundEffects ? settings.soundPack : null
    if (pack && 'dart' in row) preview.play(pack, row.dart)
    else beeps[row.beep]()
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
  <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
    {#each sounds as row (row.key)}
      <SettingSwitch
        id="pref-{row.key}"
        label={row.label}
        sub={'sub' in row ? row.sub : undefined}
        bind:checked={settings[row.key]}
        onpreview={() => playRow(row)}
        previewing={playing === row.key}
      />
    {/each}
  </div>
  {#if packs}
    <SettingSwitch
      id="pref-soundEffects"
      label="Sound packs"
      sub="Darts play a sound pack instead of the beeps"
      bind:checked={settings.soundEffects}
      onchange={() => {
        audioContext()
      }}
    />
    {#if settings.soundEffects}
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="flex flex-col gap-[2px]">
          <span id="pref-soundPack" class="text-[15px]">Sound pack for every dart</span>
          <span class="text-[13px] text-text-dim">Yours for every player on this screen, or each thrower's own</span>
        </div>
        <Select {options} value={settings.soundPack ?? EACH} onchange={pickPack} label="Sound pack for every dart" />
      </div>
    {/if}
  {/if}
</SettingsCard>
