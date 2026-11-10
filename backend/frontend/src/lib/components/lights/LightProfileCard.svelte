<script lang="ts">
  // Settings' Lights: the board's light profile (Settings-Lights board). The menu picks the built-in
  // "Dartcade default" or one of the player's own; Duplicate copies the one in use, Import makes a new
  // one from a file, Export saves it as a file. Effects are read-only for now, seat colours can be
  // changed. ▶ Test plays one rule on the board's devices now (disabled while lights are off, the
  // bridge is offline, or the bridge is outdated).
  import { Button } from '$lib/components/ui/button/index.js'
  import { Select } from '$lib/components/ui/select/index.js'
  import type { LightProfile, LightProfileSummary } from '$lib/api'
  import { effectGroups, ruleLabel } from '$lib/lights/view'
  import { isDefaultSeatColors } from '$lib/lights/seatColors'
  import SeatColorPicker from './SeatColorPicker.svelte'

  let {
    profile,
    profiles,
    canTest,
    ontest,
    onseatcolor,
    onresetseatcolors,
    onselect,
    onduplicate,
    onimport,
    onexport,
    ondelete,
  }: {
    profile: LightProfile
    profiles: LightProfileSummary[]
    canTest: boolean
    ontest: (rule: number) => void
    onseatcolor: (seat: number, hex: string) => void
    onresetseatcolors: () => void
    onselect: (profileId: string) => void
    onduplicate: () => void
    /** The file the player chose. */
    onimport: (file: File) => void
    onexport: () => void
    ondelete: () => void
  } = $props()

  let fileInput = $state<HTMLInputElement>()
  const options = $derived(profiles.map(p => ({ value: p.id, label: p.builtIn ? `${p.name} · built in` : p.name })))
</script>

<section aria-label="Light profile" class="box-border p-4 md:p-[22px] card flex flex-col gap-[14px]">
  <h2 class="text-[17px] font-semibold">Light profile</h2>
  <div class="flex gap-2 items-center flex-wrap">
    <Select label="Light profile" {options} value={profile.id} onchange={onselect} class="grow min-w-[200px] h-[42px]" />
    <Button variant="outline" size="md" onclick={onduplicate}>Duplicate</Button>
    <Button variant="outline" size="md" onclick={() => fileInput?.click()}>Import</Button>
    <input
      bind:this={fileInput}
      type="file"
      accept=".json,application/json"
      aria-label="Light profile file to import"
      tabindex="-1"
      class="sr-only"
      onchange={e => {
        const file = e.currentTarget.files?.[0]
        e.currentTarget.value = ''
        if (file) onimport(file)
      }}
    />
    <Button variant="outline" size="md" onclick={onexport}>Export</Button>
    {#if !profile.builtIn}<Button variant="destructive" size="md" onclick={ondelete}>Delete</Button>{/if}
  </div>

  <section aria-label="Seat colours" class="flex flex-col gap-1">
    <div class="flex items-center justify-between gap-2 min-h-8">
      <h3 class="text-[13px] font-semibold">Seat colours</h3>
      <Button variant="outline" size="sm" disabled={isDefaultSeatColors(profile.seatColors)} onclick={onresetseatcolors}>
        Reset to defaults
      </Button>
    </div>
    <ul class="m-0 p-0 list-none flex flex-col gap-1">
      {#each profile.seatColors as color, i (i)}
        <li class="flex items-center justify-between gap-[10px] min-h-11 px-[10px] py-1 rounded-md bg-surface-active">
          <span class="text-[13px] font-semibold">Seat {i + 1}</span>
          <SeatColorPicker seat={i + 1} {color} onpick={(hex: string) => onseatcolor(i, hex)} />
        </li>
      {/each}
    </ul>
    <span class="text-[12px] text-text-dim">
      A game with more than {profile.seatColors.length} seats starts over from seat 1's colour.
    </span>
  </section>

  <h3 class="text-[13px] font-semibold">Effects</h3>
  {#each effectGroups(profile.rules) as group (group.game)}
    <section aria-label="{group.title} effects" class="flex flex-col gap-1">
      <h4 class="text-[12px] font-semibold uppercase tracking-wide text-text-dim">{group.title}</h4>
      <ol class="m-0 p-0 list-none flex flex-col gap-1">
        {#each group.items as { rule, index: i } (i)}
          {@const label = ruleLabel(rule)}
          <li
            class:opacity-60={!label.enabled}
            class="grid grid-cols-[18px_1fr_auto] md:grid-cols-[18px_minmax(130px,1fr)_52px_1.1fr_auto]
                 items-center gap-[10px] min-h-11 px-[10px] py-2 md:py-0 rounded-md bg-surface-active"
          >
            <span class="col-start-1 row-start-1 font-mono text-[12px] text-line-strong">{i + 1}</span>

            <!-- md and up: the trigger with its filter chip, the badge and the look each in their own column -->
            <span class="hidden md:flex md:col-start-2 md:row-start-1 items-center gap-[6px] min-w-0 text-[13px] font-semibold">
              <span class="truncate" title={label.hint ?? undefined}>{label.when}</span>
              {#if !label.enabled}<span class="shrink-0 text-[11px] font-bold text-text-dim">Off</span>{/if}
              {#if label.filter}
                <span class="shrink-0 whitespace-nowrap font-mono text-[12px] text-ink-2 px-[6px] py-[2px] rounded-[5px] bg-surface-key">
                  {label.filter}
                </span>
              {/if}
            </span>
            <span
              class="hidden md:inline md:col-start-3 md:row-start-1 justify-self-start h-[22px] px-[7px] rounded-chip text-[11px] font-bold leading-[22px]
                   {label.type === 'Scene' ? 'bg-accent-tint text-accent' : 'bg-[#2b2410] text-[#f2c94c]'}"
            >
              {label.type}
            </span>
            <span class="hidden md:block md:col-start-4 md:row-start-1 text-[12px] text-text-muted truncate">{label.look}</span>

            <!-- Phones: row 1 is the trigger name alone (never squeezed); row 2 wraps the filter chip,
               the type badge and the look together, under the trigger -->
            <span class="md:hidden col-start-2 row-start-1 text-[13px] font-semibold truncate" title={label.hint ?? undefined}>
              {label.when}{#if !label.enabled}
                <span class="text-[11px] font-bold text-text-dim">· Off</span>{/if}
            </span>
            <span class="md:hidden col-start-2 row-start-2 flex flex-wrap items-center gap-[6px] min-w-0">
              {#if label.filter}
                <span class="shrink-0 whitespace-nowrap font-mono text-[12px] text-ink-2 px-[6px] py-[2px] rounded-[5px] bg-surface-key">
                  {label.filter}
                </span>
              {/if}
              <span
                class="h-[22px] px-[7px] rounded-chip text-[11px] font-bold leading-[22px]
                     {label.type === 'Scene' ? 'bg-accent-tint text-accent' : 'bg-[#2b2410] text-[#f2c94c]'}"
              >
                {label.type}
              </span>
              <span class="whitespace-nowrap text-[12px] text-text-muted">{label.look}</span>
            </span>

            <Button
              variant="outline"
              size="sm"
              disabled={!canTest}
              aria-label="Test rule {i + 1}: {label.when}{label.filter ? ` ${label.filter}` : ''}"
              onclick={() => ontest(i)}
              class="col-start-3 row-start-1 row-span-2 md:col-start-5 md:row-span-1"
            >
              ▶ Test
            </Button>
          </li>
        {/each}
      </ol>
    </section>
  {/each}

  <span class="text-[12px] text-text-dim">
    Lobby shows only while you are in a lobby with no game running, and is off by default. Effects can't be edited yet and never touch your
    WLED presets; the seat colours can. Duplicate a profile to keep your own copy, or export it as a file.
  </span>
</section>
