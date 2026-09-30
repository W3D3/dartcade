<script lang="ts">
  // Game settings as a drawer on the right, below the header (Settings-InGame board).
  import type { GameSettings } from '$lib/gameSettings.js'

  let { settings = $bindable(), gameId, onclose }: { settings: GameSettings; gameId: string; onclose: () => void } = $props()

  const display = [
    { key: 'checkoutSuggestions', label: 'Checkout suggestions', sub: 'In the dart slots when you can finish' },
    { key: 'visitSum', label: 'Visit sum', sub: 'The running total under the board' },
    { key: 'chalkboard', label: 'Chalkboard', sub: 'Scored and left for every visit' },
    { key: 'showMarkers', label: "Other players' targets", sub: 'Around the Clock with 3 or more players' },
  ] as const
  // Other players' targets only exist in Around the Clock
  const rows = $derived(display.filter(r => r.key !== 'showMarkers' || gameId === 'atc'))
  const sounds = [
    { key: 'soundHit', label: 'Hit' },
    { key: 'soundMiss', label: 'Miss' },
    { key: 'soundSwitch', label: 'Player switch' },
    { key: 'soundBust', label: 'Bust' },
  ] as const

  let panel: HTMLDivElement | undefined = $state()
  $effect(() => { panel?.focus() })
</script>

<svelte:window onkeydown={e => { if (e.key === 'Escape') onclose() }} />

<div role="presentation" class="fixed inset-x-0 top-16 bottom-0 z-40 bg-[rgba(8,9,7,0.62)]" onclick={onclose}></div>

<div bind:this={panel} tabindex="-1" role="dialog" aria-modal="true" aria-labelledby="game-settings-title"
  class="fixed top-16 right-0 bottom-0 z-50 w-[460px] max-w-full box-border px-7 pt-5 pb-6 flex flex-col overflow-y-auto
         bg-surface-active border-l border-line-2 [box-shadow:-24px_0_48px_rgba(0,0,0,.45)] outline-none">
  <div class="h-12 shrink-0 flex items-center justify-between">
    <h2 id="game-settings-title" class="m-0 font-display font-bold text-[28px] uppercase">Game settings</h2>
    <button type="button" onclick={onclose} aria-label="Close settings"
      class="w-11 h-11 -mr-2 flex items-center justify-center bg-transparent border-0 text-ink-2 cursor-pointer">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
        stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
    </button>
  </div>

  <section class="py-[18px] border-t border-line-2 flex flex-col gap-4">
    <h3 class="m-0 text-[12px] font-semibold uppercase tracking-[0.1em] text-text-dim">Display</h3>
    {#each rows as row (row.key)}
      <div class="flex items-center justify-between gap-4">
        <span class="flex flex-col gap-[2px]">
          <span id="setting-{row.key}" class="text-[15px] text-text">{row.label}</span>
          <span class="text-[13px] text-text-dim">{row.sub}</span>
        </span>
        <button type="button" role="switch" aria-checked={settings[row.key]} aria-labelledby="setting-{row.key}"
          onclick={() => settings[row.key] = !settings[row.key]}
          class="relative w-12 h-7 shrink-0 rounded-full border-0 p-0 cursor-pointer transition-colors
                 {settings[row.key] ? 'bg-accent' : 'bg-line-chip'}">
          <span class="absolute top-[3px] left-[3px] w-[22px] h-[22px] rounded-full transition-transform
                       {settings[row.key] ? 'translate-x-5 bg-accent-fg' : 'bg-text'}"></span>
        </button>
      </div>
    {/each}
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

  <p class="mt-auto mb-0 text-[13px] text-text-dim">Saved on this device. Changes apply right away.</p>
</div>
