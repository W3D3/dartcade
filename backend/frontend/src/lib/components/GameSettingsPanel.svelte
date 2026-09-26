<script lang="ts">
  import type { GameSettings } from '../gameSettings.js'

  let { settings, onchange, onclose }: {
    settings: GameSettings
    onchange: (s: GameSettings) => void
    onclose: () => void
  } = $props()

  function toggle(key: keyof GameSettings) {
    onchange({ ...settings, [key]: !settings[key] })
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onclose()
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- Backdrop -->
<div role="presentation" class="fixed inset-0 z-40" onclick={onclose}></div>

<!-- Panel -->
<div
  role="menu"
  class="absolute right-0 top-full mt-2 z-50 w-[300px] rounded-[14px] border border-line
         bg-surface-1 [box-shadow:0_12px_32px_rgba(0,0,0,0.6)]"
>
  <div class="px-5 pt-4 pb-3 border-b border-line">
    <p class="text-[13px] font-bold text-text">Game settings</p>
  </div>

  <!-- Board section -->
  <div class="px-5 pt-4 pb-2">
    <p class="text-[10px] tracking-[0.12em] uppercase font-semibold text-text-dim mb-3">Board</p>

    <label class="flex items-center justify-between cursor-pointer select-none mb-1">
      <span class="text-[13px] text-text">Show player targets on board</span>
      <button type="button" role="switch" aria-checked={settings.showMarkers}
        onclick={() => toggle('showMarkers')}
        class="relative inline-flex h-5 w-9 flex-shrink-0 rounded-full cursor-pointer
               border-0 p-0 bg-transparent">
        <span class="absolute inset-0 rounded-full transition-colors duration-150
                     {settings.showMarkers ? 'bg-accent' : 'bg-[#2e3229]'}"></span>
        <span class="absolute top-[2px] left-[2px] h-4 w-4 rounded-full bg-white
                     transition-transform duration-150
                     {settings.showMarkers ? 'translate-x-4' : 'translate-x-0'}"></span>
      </button>
    </label>
    <p class="text-[11px] text-text-dim leading-snug mb-1">
      Shows a circle with each player's initial at their current target.
    </p>
  </div>

  <div class="mx-5 h-px bg-line my-1"></div>

  <!-- Sound section -->
  <div class="px-5 pt-3 pb-4">
    <p class="text-[10px] tracking-[0.12em] uppercase font-semibold text-text-dim mb-3">Sound effects</p>

    {#each [
      { key: 'soundHit',    label: 'Hit',           desc: 'Dart lands on target' },
      { key: 'soundMiss',   label: 'Miss',          desc: 'Dart misses' },
      { key: 'soundSwitch', label: 'Player switch', desc: 'Turn passes to next player' },
    ] as row (row.key)}
      {@const k = row.key as keyof GameSettings}
      <label class="flex items-center justify-between cursor-pointer select-none py-[9px]
                    border-b border-line last:border-0">
        <div>
          <p class="text-[13px] text-text leading-none mb-[3px]">{row.label}</p>
          <p class="text-[11px] text-text-dim">{row.desc}</p>
        </div>
        <button type="button" role="switch" aria-checked={settings[k] as boolean}
          onclick={() => toggle(k)}
          class="relative inline-flex h-5 w-9 flex-shrink-0 rounded-full cursor-pointer
                 border-0 p-0 bg-transparent ml-4">
          <span class="absolute inset-0 rounded-full transition-colors duration-150
                       {settings[k] ? 'bg-accent' : 'bg-[#2e3229]'}"></span>
          <span class="absolute top-[2px] left-[2px] h-4 w-4 rounded-full bg-white
                       transition-transform duration-150
                       {settings[k] ? 'translate-x-4' : 'translate-x-0'}"></span>
        </button>
      </label>
    {/each}
  </div>
</div>
