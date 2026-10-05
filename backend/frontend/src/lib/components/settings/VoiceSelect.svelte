<script lang="ts">
  // The caller's voice in the game settings drawer: the user's packs ("Your voices", with their
  // clip counts) and the built-in voices, as a menu that opens upwards (Settings-InGame board).
  import { BUILTIN_PREFIX, DEFAULT_BUILTIN, type BuiltinVoice } from '$lib/caller/voices.js'
  import type { VoicePackSummary } from '$lib/api'
  import { audioContext } from '$lib/sounds.js'
  import OptionSelect from './OptionSelect.svelte'

  let {
    value = $bindable(),
    packs,
    builtins,
    labelledby,
  }: {
    /** A pack id or `builtin:<id>`; null for the default built-in voice. */
    value: string | null
    packs: VoicePackSummary[]
    builtins: BuiltinVoice[]
    labelledby: string
  } = $props()

  const builtinValue = (id: string) => `${BUILTIN_PREFIX}${id}`
  const groups = $derived([
    { heading: 'Your voices', options: packs.map(p => ({ value: p.id, label: p.name, meta: `${p.clips.toLocaleString('en-US')} clips` })) },
    { heading: 'Built-in', options: builtins.map(b => ({ value: builtinValue(b.id), label: b.name })) },
  ])
  // No pick (or a pack deleted since) reads as the default built-in voice
  const shown = $derived(value !== null && groups.some(g => g.options.some(o => o.value === value)) ? value : builtinValue(DEFAULT_BUILTIN))
</script>

<!-- Picking a voice is a tap: it wakes the page's audio for the caller -->
<OptionSelect
  value={shown}
  {groups}
  {labelledby}
  empty="No voices yet"
  onchange={(v: string) => {
    value = v
    audioContext()
  }}
/>
