<script lang="ts">
  // Settings (Settings, Settings-Game, Settings-Caller, Settings-Boards-Empty, Settings-Phone boards):
  // a section nav over Profile, Game preferences, Boards, Lights and Caller, each its own
  // route (`#/settings/<section>`). Lights only shows behind its flag. Tablets and desktops open
  // on Profile; phones get a list of the sections first.
  import { onMount, untrack, type Component } from 'svelte'
  import { ChevronLeft, ChevronRight, Lightbulb, Mic, Monitor, SlidersHorizontal, User, Volume2 } from '@lucide/svelte'
  import Layout from '$lib/components/Layout.svelte'
  import AccountCard from '$lib/components/settings/AccountCard.svelte'
  import CallerDefaults from '$lib/components/settings/CallerDefaults.svelte'
  import CallerVoices from '$lib/components/settings/CallerVoices.svelte'
  import SoundEffects from '$lib/components/settings/SoundEffects.svelte'
  import GamePrefs from '$lib/components/settings/GamePrefs.svelte'
  import NameCard from '$lib/components/settings/NameCard.svelte'
  import YourCard from '$lib/components/settings/YourCard.svelte'
  import BoardsSection from '$lib/components/boards/BoardsSection.svelte'
  import LightsSection from '$lib/components/lights/LightsSection.svelte'
  import { currentUser } from '$lib/auth'
  import { flag } from '$lib/flags'
  import { loadVoiceLibrary } from '$lib/caller/voices.js'
  import { loadSettings, saveSettings } from '$lib/gameSettings.js'
  import { accountSettings, writeThrough } from '$lib/accountSettings'
  import { SETTINGS_SECTIONS, sectionOf } from '$lib/settings/sections'
  import { sectionVisible } from '$lib/lights/view'
  import { commitUrl, serverVersion, shortCommit } from '$lib/version'

  let { params = {} }: { params?: { section?: string } } = $props()

  const lightsOn = flag('lights.enabled')
  // Sound packs are progression rewards
  const progression = flag('progression.enabled')
  const visible = $derived(SETTINGS_SECTIONS.filter(s => sectionVisible(s, { 'lights.enabled': $lightsOn })))

  const rawSection = $derived(sectionOf(params.section))
  // Lights with the flag off falls back to the bare route, same as any other unknown section
  const section = $derived(rawSection === 'lights' && !$lightsOn ? null : rawSection)
  const shown = $derived(section ?? 'profile')
  const title = $derived(SETTINGS_SECTIONS.find(s => s.id === section)?.label ?? 'Settings')

  const ICONS: Record<(typeof SETTINGS_SECTIONS)[number]['id'], Component<{ size?: number; strokeWidth?: number; class?: string }>> = {
    profile: User,
    game: SlidersHorizontal,
    boards: Monitor,
    lights: Lightbulb,
    caller: Mic,
    sounds: Volume2,
  }
  // The phone list's line under each section
  const SUBS = $derived({
    profile: $currentUser ? `@${$currentUser.name} · how friends see you` : 'How friends see you',
    game: 'Checkout suggestions, new game defaults',
    boards: 'Pair and manage your Autodarts boards',
    lights: 'Board lights that react to your game',
    caller: 'Voices and the caller in X01',
    sounds: 'Hits, misses, busts and sound packs',
  })

  // The game settings: the account's (once loaded) over this device's; changes go to both
  let settings = $state(loadSettings(typeof localStorage === 'undefined' ? null : localStorage))
  $effect(() => {
    const account = $accountSettings
    if (account) untrack(() => (settings = { ...settings, ...account }))
  })
  $effect(() => {
    saveSettings(typeof localStorage === 'undefined' ? null : localStorage, settings)
    writeThrough($state.snapshot(settings))
  })

  onMount(() => {
    void loadVoiceLibrary()
  })
</script>

<Layout {title}>
  <main class="flex min-h-0 flex-grow flex-col gap-[14px] md:gap-[22px] overflow-y-auto box-border p-4 md:p-[34px_32px] xl:p-[34px_44px]">
    <header class="hidden md:flex flex-col gap-[18px]">
      <div class="flex flex-col gap-[6px]">
        <h1 class="m-0 font-display font-bold text-[48px] leading-none uppercase tracking-[0.02em]">Settings</h1>
        <p class="m-0 text-[15px] text-text-muted">Account settings follow you to every board and device.</p>
      </div>
      <nav aria-label="Settings sections" class="flex gap-1 border-b border-line overflow-x-auto [scrollbar-width:none]">
        {#each visible as s (s.id)}
          {@const Icon = ICONS[s.id]}
          {@const on = s.id === shown}
          <a
            href="#/settings/{s.id}"
            aria-current={on ? 'page' : undefined}
            class="h-[46px] px-4 -mb-px flex items-center gap-[9px] shrink-0 whitespace-nowrap text-[15px] no-underline border-b-2
                   transition-colors {on
              ? 'border-accent !text-text font-semibold'
              : 'border-transparent !text-text-muted font-medium hover:!text-text'}"
          >
            <Icon size={18} strokeWidth={1.8} class={on ? 'text-accent' : ''} />{s.label}
          </a>
        {/each}
      </nav>
    </header>

    {#if section === null}
      <!-- Phones: the sections as a list -->
      <nav aria-label="Settings sections" class="md:hidden flex flex-col gap-[14px]">
        {#each visible as s (s.id)}
          {@const Icon = ICONS[s.id]}
          <a href="#/settings/{s.id}" class="flex items-center gap-[14px] p-4 card no-underline !text-text hover:bg-surface-active">
            <span class="w-10 h-10 shrink-0 flex items-center justify-center rounded-[10px] bg-surface-active text-accent">
              <Icon size={20} strokeWidth={1.8} />
            </span>
            <span class="flex flex-col gap-[2px] flex-grow min-w-0">
              <span class="text-[17px] font-semibold">{s.label}</span>
              <span class="text-[13px] text-text-muted truncate">{SUBS[s.id]}</span>
            </span>
            <ChevronRight size={18} class="text-text-muted shrink-0" />
          </a>
        {/each}
      </nav>
    {:else}
      <a
        href="#/settings"
        class="md:hidden self-start -my-1 min-h-10 inline-flex items-center gap-1 text-[14px] font-semibold no-underline"
      >
        <ChevronLeft size={16} strokeWidth={2.2} />Settings
      </a>
    {/if}

    <!-- Phones on the list see no section; larger screens open on Profile -->
    <div class="{section === null ? 'hidden md:flex' : 'flex'} flex-col flex-grow">
      {#if shown === 'profile'}
        <div class="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_380px] gap-4 md:gap-5 items-start">
          <div class="flex flex-col gap-4 md:gap-5">
            <YourCard />
            <NameCard />
          </div>
          <AccountCard />
        </div>
      {:else if shown === 'game'}
        <GamePrefs bind:settings />
      {:else if shown === 'boards'}
        <BoardsSection />
      {:else if shown === 'lights'}
        <LightsSection />
      {:else if shown === 'caller'}
        <div class="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-4 md:gap-5 items-start">
          <CallerVoices current={settings.callerVoice} volume={settings.volume} />
          <div class="flex flex-col gap-4 md:gap-5">
            <CallerDefaults bind:settings />
          </div>
        </div>
      {:else if shown === 'sounds'}
        <SoundEffects bind:settings packs={$progression} />
      {/if}
    </div>

    {#if $serverVersion}
      <p class="m-0 mt-auto pt-2 text-[12px] text-text-dim">
        dartcade {$serverVersion.version}{#if $serverVersion.commit}
          · <a
            href={commitUrl($serverVersion.commit)}
            target="_blank"
            rel="noopener noreferrer"
            class="font-mono !text-text-dim hover:!text-text-muted">{shortCommit($serverVersion.commit)}</a
          >{/if}
      </p>
    {/if}
  </main>
</Layout>
