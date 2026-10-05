<script lang="ts">
  // Account settings (Settings and Settings-Phone boards). For now: the caller's voices.
  import { onMount } from 'svelte'
  import Layout from '$lib/components/Layout.svelte'
  import CallerVoices from '$lib/components/settings/CallerVoices.svelte'
  import NameCard from '$lib/components/settings/NameCard.svelte'
  import { loadVoiceLibrary } from '$lib/caller/voices.js'
  import { loadSettings } from '$lib/gameSettings.js'

  // The game settings on this device: which voice is "your voice", and the samples' volume
  const settings = loadSettings(typeof localStorage === 'undefined' ? null : localStorage)

  onMount(() => {
    void loadVoiceLibrary()
  })
</script>

<Layout title="Settings">
  <main class="flex min-h-0 flex-grow flex-col gap-[14px] md:gap-6 overflow-y-auto box-border p-4 md:p-[40px_32px] xl:p-[40px_44px]">
    <header class="hidden md:flex flex-col gap-[6px]">
      <h1 class="m-0 font-display font-bold text-[48px] leading-none uppercase tracking-[0.02em]">Settings</h1>
      <p class="m-0 text-[15px] text-text-muted">Account settings follow you to every board and device.</p>
    </header>
    <div class="w-full max-w-[760px] flex flex-col gap-[14px] md:gap-6">
      <NameCard />
      <CallerVoices current={settings.callerVoice} volume={settings.volume} />
    </div>
  </main>
</Layout>
