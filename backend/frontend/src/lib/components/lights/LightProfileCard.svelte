<script lang="ts">
  // Settings' Lights: the board's light profile (Settings-Lights board). Only the built-in
  // "Dartcade default" exists today, so Duplicate/Import/Export are disabled; ▶ Test plays one
  // rule on the board's devices now (disabled while lights are off, the bridge is offline, or
  // the bridge is outdated).
  import { ChevronDown } from '@lucide/svelte'
  import { Button } from '$lib/components/ui/button/index.js'
  import { SEAT_COLORS } from '$shared/lights/index.js'
  import type { LightProfile } from '$lib/api'
  import { ruleLabel } from '$lib/lights/view'

  let { profile, canTest, ontest }: { profile: LightProfile; canTest: boolean; ontest: (rule: number) => void } = $props()
</script>

<section aria-label="Light profile" class="box-border p-4 md:p-[22px] card flex flex-col gap-[14px]">
  <h2 class="m-0 text-[17px] font-semibold">Light profile</h2>
  <div class="flex gap-2 items-center flex-wrap">
    <button
      type="button"
      aria-haspopup="listbox"
      aria-label="Light profile: {profile.name}"
      disabled
      class="flex-grow min-w-0 h-[42px] px-3 flex items-center gap-2 rounded-[10px] border border-line-strong
             bg-bg text-text text-[14px] font-semibold whitespace-nowrap cursor-default disabled:opacity-100"
    >
      {profile.name}
      {#if profile.builtIn}<span class="text-[11px] text-text-dim">· built in</span>{/if}
      <ChevronDown size={16} class="ml-auto text-text-dim" />
    </button>
    <Button variant="outline" size="md" disabled title="Coming soon">Duplicate</Button>
    <Button variant="outline" size="md" disabled title="Coming soon">Import</Button>
    <Button variant="outline" size="md" disabled title="Coming soon">Export</Button>
  </div>

  <div class="flex items-center gap-[14px] text-[12px] text-text-dim flex-wrap">
    <span>Seat colours come from the game:</span>
    {#each SEAT_COLORS as color, i (i)}
      <span class="inline-flex items-center gap-[5px] text-[12px] text-ink-2">
        <span class="w-[10px] h-[10px] rounded-full" style="background: {color}"></span>
        Seat {i + 1}
      </span>
    {/each}
  </div>

  <ol class="m-0 p-0 list-none flex flex-col gap-1">
    {#each profile.rules as rule, i (i)}
      {@const label = ruleLabel(rule)}
      <li
        class="grid grid-cols-[18px_minmax(130px,1fr)_52px_1.1fr_auto] items-center gap-[10px] min-h-11 px-[10px] rounded-[10px] bg-surface-active"
      >
        <span class="font-mono text-[12px] text-line-strong">{i + 1}</span>
        <span class="flex items-center gap-[6px] min-w-0 text-[13px] font-semibold">
          <span class="truncate">{label.when}</span>
          {#if label.filter}
            <span class="shrink-0 whitespace-nowrap font-mono text-[12px] text-ink-2 px-[6px] py-[2px] rounded-[5px] bg-surface-key">
              {label.filter}
            </span>
          {/if}
        </span>
        <span
          class="justify-self-start h-[22px] px-[7px] rounded-[6px] text-[11px] font-bold leading-[22px]
                 {label.type === 'Scene' ? 'bg-accent-tint text-accent' : 'bg-[#2b2410] text-[#f2c94c]'}"
        >
          {label.type}
        </span>
        <span class="text-[12px] text-text-muted truncate">{label.look}</span>
        <Button
          variant="outline"
          size="sm"
          disabled={!canTest}
          aria-label="Test rule {i + 1}: {label.when}{label.filter ? ` ${label.filter}` : ''}"
          onclick={() => ontest(i)}
        >
          ▶ Test
        </Button>
      </li>
    {/each}
  </ol>

  <span class="text-[12px] text-text-dim">
    The built-in default can't be edited and never touches your WLED presets. Duplicate it to make your own.
  </span>
</section>
