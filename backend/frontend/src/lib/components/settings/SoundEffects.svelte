<script lang="ts">
  // Settings' Sounds: every sound effect a match plays, at one volume (set on each device; the
  // caller has its own). Which ones play follows your account. With progression on, darts can play
  // sound packs instead of the beeps: each thrower's own, or one of yours for everyone
  // (sounds.anyPack: any pack, locked or not).
  import SettingsCard from '$lib/components/settings/SettingsCard.svelte'
  import type { GameSettings } from '$lib/gameSettings.js'
  import { audioContext } from '$lib/sounds.js'
  import { createSoundPacks } from '$lib/soundPacks'
  import { flag } from '$lib/flags'
  import { progress } from '$lib/progress/store'
  import { PERKS } from '$shared/progression.js'
  import SettingSwitch from '$lib/components/SettingSwitch.svelte'
  import Select from '$lib/components/ui/select/select.svelte'
  import VolumeSlider from './VolumeSlider.svelte'

  let { settings = $bindable(), packs = false }: { settings: GameSettings; packs?: boolean } = $props()

  const sounds = [
    { key: 'soundHit', label: 'Hit' },
    { key: 'soundTreble', label: 'Treble', sub: 'Off: trebles play the hit sound' },
    { key: 'soundMiss', label: 'Miss' },
    { key: 'soundSwitch', label: 'Player switch' },
    { key: 'soundBust', label: 'Bust' },
    { key: 'soundWin', label: 'Win' },
  ] as const

  const anyPack = flag('sounds.anyPack')
  const EACH = 'each'
  const packOptions = $derived([
    { value: EACH, label: "Each thrower's own" },
    ...PERKS.filter(p => p.kind === 'sound' && p.id !== 'sound.none')
      .filter(p => $anyPack || ($progress?.perks.unlocked ?? []).includes(p.id) || p.id === settings.soundPack)
      .map(p => ({ value: p.id, label: p.name })),
  ])
  const preview = createSoundPacks(() => settings.effectsVolume)
  function pickPack(v: string) {
    settings.soundPack = v === EACH ? null : v
    if (settings.soundPack) {
      audioContext()
      preview.preview(settings.soundPack)
    }
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
      <SettingSwitch id="pref-{row.key}" label={row.label} sub={'sub' in row ? row.sub : undefined} bind:checked={settings[row.key]} />
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
        <Select options={packOptions} value={settings.soundPack ?? EACH} onchange={pickPack} label="Sound pack for every dart" />
      </div>
    {/if}
  {/if}
</SettingsCard>
