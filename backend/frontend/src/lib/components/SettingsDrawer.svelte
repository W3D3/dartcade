<script lang="ts">
  import { ChevronRight, X } from '@lucide/svelte'
  // Game settings as a drawer on the right, below the header (Settings-InGame board).
  import { onMount } from 'svelte'
  import type { GameSettings } from '$lib/gameSettings.js'
  import type { ScoreUpdates } from '$lib/heldScore.js'
  import { loadVoiceLibrary, voiceLibrary } from '$lib/caller/voices.js'
  import { audioContext } from '$lib/sounds.js'
  import SettingSwitch from './SettingSwitch.svelte'
  import VoiceSelect from './settings/VoiceSelect.svelte'

  let { settings = $bindable(), gameId, onclose }: { settings: GameSettings; gameId: string; onclose: () => void } = $props()

  const display = [
    { key: 'checkoutSuggestions', label: 'Checkout suggestions', sub: 'In the dart slots when you can finish' },
    { key: 'visitSum', label: 'Visit sum', sub: 'The running total under the board' },
    { key: 'chalkboard', label: 'Chalkboard', sub: 'Scored and left for every visit' },
    { key: 'showMarkers', label: "Other players' targets", sub: 'Around the Clock with 3 or more players' },
  ] as const
  // Other players' targets only exist in Around the Clock
  const rows = $derived(display.filter(r => r.key !== 'showMarkers' || gameId === 'atc'))
  const scoreUpdates: { value: ScoreUpdates; label: string }[] = [
    { value: 'dart', label: 'Every dart' },
    { value: 'visit', label: 'After the visit' },
  ]
  const sounds = [
    { key: 'soundHit', label: 'Hit' },
    { key: 'soundMiss', label: 'Miss' },
    { key: 'soundSwitch', label: 'Player switch' },
    { key: 'soundBust', label: 'Bust' },
  ] as const

  // The caller (X01 only) picks from the user's voices, loaded fresh when the drawer opens
  onMount(() => { if (gameId === 'x01') void loadVoiceLibrary() })

  let panel: HTMLDivElement | undefined = $state()
  // Focus the drawer while open, and give focus back to the cog when it closes
  $effect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    panel?.focus()
    return () => opener?.focus()
  })
  // Keep Tab inside the drawer
  function trap(e: KeyboardEvent) {
    if (e.key !== 'Tab' || !panel) return
    const items = [...panel.querySelectorAll<HTMLElement>('a[href], button:not(:disabled), input')]
    const first = items[0], last = items[items.length - 1]
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
  }
</script>

<!-- An open voice menu takes Escape for itself (and marks it handled) -->
<svelte:window onkeydown={(e: KeyboardEvent) => { if (e.key === 'Escape' && !e.defaultPrevented) onclose() }} />

<div role="presentation" class="fixed inset-x-0 top-14 md:top-16 bottom-0 z-40 bg-[rgba(8,9,7,0.62)]" onclick={onclose}></div>

<div bind:this={panel} tabindex="-1" role="dialog" aria-modal="true" aria-labelledby="game-settings-title" onkeydown={trap}
  class="fixed top-14 md:top-16 right-0 bottom-0 z-50 w-[460px] max-w-full box-border px-4 md:px-7 pt-5 pb-6 flex flex-col overflow-y-auto
         bg-surface-active border-l border-line-2 [box-shadow:-24px_0_48px_rgba(0,0,0,.45)] outline-none">
  <div class="h-12 shrink-0 flex items-center justify-between">
    <h2 id="game-settings-title" class="m-0 font-display font-bold text-[28px] uppercase">Game settings</h2>
    <button type="button" onclick={onclose} aria-label="Close settings"
      class="w-11 h-11 -mr-2 flex items-center justify-center bg-transparent border-0 text-ink-2 cursor-pointer">
      <X size={18} />
    </button>
  </div>

  <section class="py-[18px] border-t border-line-2 flex flex-col gap-4">
    <h3 class="m-0 text-[12px] font-semibold uppercase tracking-[0.1em] text-text-dim">Display</h3>
    {#each rows as row (row.key)}
      <SettingSwitch id="setting-{row.key}" label={row.label} sub={row.sub} bind:checked={settings[row.key]} />
    {/each}
    {#if gameId === 'x01'}
      <div class="flex flex-col gap-2">
        <span class="flex flex-col gap-[2px]">
          <span id="setting-scoreUpdates" class="text-[15px] text-text">Score left</span>
          <span class="text-[13px] text-text-dim">When the big score counts down</span>
        </span>
        <div role="radiogroup" aria-labelledby="setting-scoreUpdates" class="flex gap-1 p-1 bg-bg rounded-[10px]">
          {#each scoreUpdates as opt (opt.value)}
            {@const on = settings.scoreUpdates === opt.value}
            <button type="button" role="radio" aria-checked={on} onclick={() => settings.scoreUpdates = opt.value}
              class="flex-1 h-10 rounded-[7px] text-[15px] border-0 cursor-pointer transition-colors
                     {on ? 'bg-line text-text font-semibold' : 'bg-transparent text-ink-2 font-medium'}">{opt.label}</button>
          {/each}
        </div>
      </div>
    {/if}
  </section>

  <section class="py-[18px] border-t border-line-2 flex flex-col gap-4">
    <h3 class="m-0 text-[12px] font-semibold uppercase tracking-[0.1em] text-text-dim">Sound effects</h3>
    <label class="flex items-center gap-3">
      <span class="text-[15px] w-20">Volume</span>
      <input type="range" min="0" max="100" step="5" value={Math.round(settings.volume * 100)}
        oninput={e => settings.volume = Number(e.currentTarget.value) / 100}
        class="flex-1 accent-accent" />
      <span class="font-mono text-[13px] text-text-muted w-11 text-right">{Math.round(settings.volume * 100)}%</span>
    </label>
    <div class="grid grid-cols-2 gap-x-4">
      {#each sounds as row (row.key)}
        <label class="h-11 flex items-center gap-3 cursor-pointer text-[15px]">
          <input type="checkbox" bind:checked={settings[row.key]} class="w-6 h-6 accent-accent" />
          {row.label}
        </label>
      {/each}
    </div>
  </section>

  {#if gameId === 'x01'}
    <section class="py-[18px] border-t border-line-2 flex flex-col gap-4">
      <h3 class="m-0 text-[12px] font-semibold uppercase tracking-[0.1em] text-text-dim">Caller</h3>
      <SettingSwitch id="setting-callerOn" label="Caller" sub="Calls each visit" bind:checked={settings.callerOn}
        onchange={() => { audioContext() }} />
      <div class="flex items-center justify-between gap-4">
        <span id="setting-callerVoice" class="text-[15px] text-text">Voice</span>
        <VoiceSelect bind:value={settings.callerVoice} packs={$voiceLibrary.packs} builtins={$voiceLibrary.builtins} labelledby="setting-callerVoice" />
      </div>
      <div class="flex flex-col gap-1">
        <a href="#/settings" class="self-start min-h-10 inline-flex items-center gap-[6px] text-[14px] font-semibold no-underline">
          Manage voices<ChevronRight size={14} strokeWidth={2.2} />
        </a>
        <span class="text-[12px] text-text-dim">Import packs and delete them in Settings.</span>
      </div>
    </section>
  {/if}

  <p class="mt-auto mb-0 text-[13px] text-text-dim">Saved on this device. Changes apply right away.</p>
</div>
