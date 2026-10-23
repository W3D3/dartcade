<script lang="ts">
  import { ChevronRight, X } from '@lucide/svelte'
  // Game settings as a drawer on the right, below the header (Settings-InGame board).
  import { onMount } from 'svelte'
  import { Dialog } from 'bits-ui'
  import type { BoardView, GameSettings } from '$lib/gameSettings.js'
  import type { ScoreUpdates } from '$lib/heldScore.js'
  import { loadVoiceLibrary, voiceLibrary } from '$lib/caller/voices.js'
  import { audioContext } from '$lib/sounds.js'
  import SettingSwitch from './SettingSwitch.svelte'
  import VoiceSelect from './settings/VoiceSelect.svelte'
  import OptionSelect from './settings/OptionSelect.svelte'
  import { BOARD_VIEWS, BOARD_VIEW_LABELS } from '$lib/gameSettings.js'

  let { settings = $bindable(), gameId, onclose }: { settings: GameSettings; gameId: string; onclose: () => void } = $props()

  const display = [
    { key: 'checkoutSuggestions', label: 'Checkout suggestions', sub: 'In the dart slots when you can finish' },
    { key: 'visitSum', label: 'Visit sum', sub: 'The running total under the board' },
    { key: 'chalkboard', label: 'Chalkboard', sub: 'Scored and left for every visit' },
    { key: 'showMarkers', label: "Other players' targets", sub: 'Around the Clock with 3 or more players' },
  ] as const
  const minigolfDisplay = [
    { key: 'aimDial', label: 'Direction wheel', sub: 'Around your ball while you aim' },
    { key: 'slowMotion', label: 'Slow motion', sub: 'When the ball gets close to the cup' },
  ] as const
  // Other players' targets only exist in Around the Clock; Minigolf has its own
  const rows = $derived(gameId === 'minigolf' ? minigolfDisplay : display.filter(r => r.key !== 'showMarkers' || gameId === 'atc'))
  const scoreUpdates: { value: ScoreUpdates; label: string }[] = [
    { value: 'dart', label: 'Every dart' },
    { value: 'visit', label: 'After the visit' },
  ]
  const boardViews: { value: BoardView; label: string }[] = BOARD_VIEWS.map(v => ({ value: v, label: BOARD_VIEW_LABELS[v] }))
  const allSounds = [
    { key: 'soundHit', label: 'Hit' },
    { key: 'soundMiss', label: 'Miss' },
    { key: 'soundSwitch', label: 'Player switch' },
    { key: 'soundBust', label: 'Bust' },
    { key: 'soundBall', label: 'Ball' },
    { key: 'soundWin', label: 'Win' },
  ] as const
  // No bust in Minigolf; the ball's sound only there
  const sounds = $derived(allSounds.filter(r => (gameId === 'minigolf' ? r.key !== 'soundBust' : r.key !== 'soundBall')))

  // The caller (X01 only) picks from the user's voices, loaded fresh when the drawer opens
  onMount(() => {
    if (gameId === 'x01') void loadVoiceLibrary()
  })
</script>

<!-- A bits-ui Dialog (focus kept inside, Escape, focus back to the cog), closed by unmounting it.
     The backdrop takes clicks outside, so the cog stays clickable: no scroll lock. -->
<Dialog.Root bind:open={() => true, open => !open && onclose()}>
  <div role="presentation" class="fixed inset-x-0 top-14 md:top-16 bottom-0 z-40 bg-[rgba(8,9,7,0.62)]" onclick={onclose}></div>

  <Dialog.Content
    aria-labelledby="game-settings-title"
    interactOutsideBehavior="ignore"
    preventScroll={false}
    class="fixed top-14 md:top-16 right-0 bottom-0 z-50 w-[460px] max-w-full box-border px-4 md:px-7 pt-5 pb-6 flex flex-col overflow-y-auto scrollbar-themed
         bg-surface-active border-l border-line-2 [box-shadow:-24px_0_48px_rgba(0,0,0,.45)] outline-none"
  >
    <div class="h-12 shrink-0 flex items-center justify-between">
      <h2 id="game-settings-title" class="m-0 font-display font-bold text-[28px] uppercase">Game settings</h2>
      <button
        type="button"
        onclick={onclose}
        aria-label="Close settings"
        class="w-11 h-11 -mr-2 flex items-center justify-center bg-transparent border-0 text-ink-2 cursor-pointer"
      >
        <X size={18} />
      </button>
    </div>

    <section class="py-[18px] border-t border-line-2 flex flex-col gap-4">
      <h3 class="m-0 text-[12px] font-semibold label-caps text-text-dim">Display</h3>
      {#each rows as row (row.key)}
        <SettingSwitch id="setting-{row.key}" label={row.label} sub={row.sub} bind:checked={settings[row.key]} />
      {/each}
      <div class="flex flex-col gap-2">
        <span class="flex flex-col gap-[2px]">
          <span id="setting-boardView" class="text-[15px] text-text">Board view</span>
          <span class="text-[13px] text-text-dim">Drawn, or a camera's picture of the real board after each dart</span>
        </span>
        <!-- Phones: five options don't fit side by side, so a menu -->
        <div class="sm:hidden">
          <OptionSelect
            value={settings.boardView}
            groups={[{ options: boardViews }]}
            labelledby="setting-boardView"
            class="w-full"
            onchange={(v: string) => {
              const view = BOARD_VIEWS.find(b => b === v)
              if (view) settings.boardView = view
            }}
          />
        </div>
        <div role="radiogroup" aria-labelledby="setting-boardView" class="hidden sm:flex gap-1 p-1 bg-bg rounded-[10px]">
          {#each boardViews as opt (opt.value)}
            {@const on = settings.boardView === opt.value}
            <button
              type="button"
              role="radio"
              aria-checked={on}
              onclick={() => (settings.boardView = opt.value)}
              class="flex-1 h-10 whitespace-nowrap rounded-[7px] text-[15px] border-0 cursor-pointer transition-colors
                   {on ? 'bg-line text-text font-semibold' : 'bg-transparent text-ink-2 font-medium'}">{opt.label}</button
            >
          {/each}
        </div>
      </div>
      {#if gameId === 'x01'}
        <div class="flex flex-col gap-2">
          <span class="flex flex-col gap-[2px]">
            <span id="setting-scoreUpdates" class="text-[15px] text-text">Score left</span>
            <span class="text-[13px] text-text-dim">When the big score counts down</span>
          </span>
          <div role="radiogroup" aria-labelledby="setting-scoreUpdates" class="flex gap-1 p-1 bg-bg rounded-[10px]">
            {#each scoreUpdates as opt (opt.value)}
              {@const on = settings.scoreUpdates === opt.value}
              <button
                type="button"
                role="radio"
                aria-checked={on}
                onclick={() => (settings.scoreUpdates = opt.value)}
                class="flex-1 h-10 rounded-[7px] text-[15px] border-0 cursor-pointer transition-colors
                     {on ? 'bg-line text-text font-semibold' : 'bg-transparent text-ink-2 font-medium'}">{opt.label}</button
              >
            {/each}
          </div>
        </div>
      {/if}
    </section>

    <section class="py-[18px] border-t border-line-2 flex flex-col gap-4">
      <h3 class="m-0 text-[12px] font-semibold label-caps text-text-dim">Sound effects</h3>
      <label class="flex items-center gap-3">
        <span class="text-[15px] w-20">Volume</span>
        <input
          type="range"
          min="0"
          max="100"
          step="5"
          value={Math.round(settings.effectsVolume * 100)}
          oninput={e => (settings.effectsVolume = Number(e.currentTarget.value) / 100)}
          class="flex-1 accent-accent"
        />
        <span class="font-mono text-[13px] text-text-muted w-11 text-right">{Math.round(settings.effectsVolume * 100)}%</span>
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
        <h3 class="m-0 text-[12px] font-semibold label-caps text-text-dim">Caller</h3>
        <SettingSwitch
          id="setting-callerOn"
          label="Caller"
          sub="Calls each visit"
          bind:checked={settings.callerOn}
          onchange={() => {
            audioContext()
          }}
        />
        {#if settings.callerOn}
          <SettingSwitch
            id="setting-callerCheckouts"
            label="Checkout calls"
            sub="“You require 121” when the next thrower can finish"
            bind:checked={settings.callerCheckouts}
          />
          {#if settings.callerCheckouts}
            <SettingSwitch
              id="setting-callerCheckoutRepeat"
              label="Repeat checkout calls"
              sub="Say it again while the score stays the same"
              bind:checked={settings.callerCheckoutRepeat}
            />
          {/if}
        {/if}
        <div class="flex items-center justify-between gap-4">
          <span id="setting-callerVoice" class="text-[15px] text-text">Voice</span>
          <VoiceSelect
            bind:value={settings.callerVoice}
            packs={$voiceLibrary.packs}
            builtins={$voiceLibrary.builtins}
            labelledby="setting-callerVoice"
          />
        </div>
        <div class="flex flex-col gap-1">
          <a href="#/settings/caller" class="self-start min-h-10 inline-flex items-center gap-[6px] text-[14px] font-semibold no-underline">
            Manage voices<ChevronRight size={14} strokeWidth={2.2} />
          </a>
          <span class="text-[12px] text-text-dim">Import packs and delete them in Settings.</span>
        </div>
      </section>
    {/if}

    <p class="mt-auto mb-0 text-[13px] text-text-dim">Saved on this device. Changes apply right away.</p>
  </Dialog.Content>
</Dialog.Root>
