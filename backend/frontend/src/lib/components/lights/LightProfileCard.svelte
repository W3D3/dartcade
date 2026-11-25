<script lang="ts">
  // Settings' Lights: the board's light profile. The menu picks the built-in "Dartcade default"
  // (Settings-Lights: its effects by game, read-only but each can be switched off) or one of the
  // player's own (Settings-Lights-Rules: its rules in match order, to edit, add and drag); Duplicate
  // copies the one in use, Import makes a new one from a file, Export saves it as a file, and ⋯
  // renames, resets or deletes one of the player's own. Seat colours can be changed on both. ▶ Test
  // plays one rule on the board's devices now (disabled while lights are off or the bridge is
  // offline or outdated).
  import { Ellipsis } from '@lucide/svelte'
  import { Button } from '$lib/components/ui/button/index.js'
  import MenuItem from '$lib/components/lobby/MenuItem.svelte'
  import PopoverMenu from '$lib/components/lobby/PopoverMenu.svelte'
  import { Select } from '$lib/components/ui/select/index.js'
  import { Switch } from '$lib/components/ui/switch/index.js'
  import type { LightProfile, LightProfileSummary } from '$lib/api'
  import { effectGroups, ruleLabel } from '$lib/lights/view'
  import { isDefaultSeatColors } from '$lib/lights/seatColors'
  import SeatColorPicker from './SeatColorPicker.svelte'
  import RuleList from './RuleList.svelte'

  let {
    profile,
    profiles,
    canTest,
    ontest,
    onseatcolor,
    onresetseatcolors,
    onenabled,
    onselect,
    onduplicate,
    onimport,
    onexport,
    ondelete,
    onrename,
    onreset,
    onedit,
    onadd,
    onmove,
    saved = false,
  }: {
    profile: LightProfile
    profiles: LightProfileSummary[]
    canTest: boolean
    ontest: (rule: number) => void
    onseatcolor: (seat: number, hex: string) => void
    onresetseatcolors: () => void
    /** Switches the effect at this place in the profile on or off. */
    onenabled: (index: number, enabled: boolean) => void
    onselect: (profileId: string) => void
    onduplicate: () => void
    /** The file the player chose. */
    onimport: (file: File) => void
    onexport: () => void
    ondelete: () => void
    onrename: () => void
    /** Puts the built-in profile's rules back into one of the player's own. */
    onreset: () => void
    onedit: (index: number) => void
    onadd: () => void
    onmove: (from: number, to: number) => Promise<boolean>
    /** The rules were just saved. */
    saved?: boolean
  } = $props()

  let fileInput = $state<HTMLInputElement>()
  const options = $derived(profiles.map(p => ({ value: p.id, label: p.builtIn ? `${p.name} · built in` : p.name })))
</script>

<section aria-label="Light profile" class="box-border p-4 md:p-[22px] card flex flex-col gap-[14px]">
  <div class="flex items-center justify-between gap-3">
    <h2 class="text-[17px] font-semibold">Light profile</h2>
    <div class="flex items-center gap-2">
      {#if saved}<span role="status" class="text-caption font-semibold text-accent">Saved</span>{/if}
      {#if !profile.builtIn}
        <PopoverMenu
          label="More for {profile.name}"
          triggerLabel="More for {profile.name}"
          align="right"
          width={230}
          triggerClass="h-9 w-9 shrink-0 flex items-center justify-center rounded-md border border-line-3 bg-transparent text-ink-2"
        >
          {#snippet trigger()}<Ellipsis size={18} />{/snippet}
          {#snippet children(close: () => void)}
            <MenuItem
              label="Rename"
              onclick={() => {
                close()
                onrename()
              }}
            />
            <MenuItem
              label="Reset to the default rules"
              onclick={() => {
                close()
                onreset()
              }}
            />
            <MenuItem
              label="Delete"
              danger
              onclick={() => {
                close()
                ondelete()
              }}
            />
          {/snippet}
        </PopoverMenu>
      {/if}
    </div>
  </div>
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

  <h3 class="text-[13px] font-semibold">{profile.builtIn ? 'Effects' : 'Rules'}</h3>
  {#if profile.builtIn}
    {#each effectGroups(profile.rules) as group (group.game)}
      <section aria-label="{group.title} effects" class="flex flex-col gap-1">
        <h4 class="text-[12px] font-semibold uppercase tracking-wide text-text-dim">{group.title}</h4>
        <ol class="m-0 p-0 list-none flex flex-col gap-1">
          {#each group.items as { rule, index: i } (i)}
            {@const label = ruleLabel(rule)}
            <li
              class="grid grid-cols-[18px_1fr_auto] md:grid-cols-[18px_minmax(130px,1fr)_52px_1.1fr_auto_auto] {label.enabled
                ? ''
                : '[&>*:not([role=switch])]:opacity-60'}
                 items-center gap-[10px] min-h-11 px-[10px] py-2 md:py-0 rounded-md bg-surface-active"
            >
              <span class="col-start-1 row-start-1 font-mono text-[12px] text-line-strong">{i + 1}</span>

              <!-- md and up: the trigger with its filter chip, the badge and the look each in their own column -->
              <span class="hidden md:flex md:col-start-2 md:row-start-1 items-center gap-[6px] min-w-0 text-[13px] font-semibold">
                <span class="truncate" title={label.hint ?? undefined}>{label.when}</span>
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
                {label.when}
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

              <!-- A switched-off effect is dimmed, but not its switch: that is what brings it back -->
              <Switch
                size="sm"
                checked={rule.enabled}
                onCheckedChange={(on: boolean) => onenabled(i, on)}
                aria-label="{label.when}{label.filter ? ` ${label.filter}` : ''} on"
                class="col-start-3 row-start-1 md:col-start-5"
              />
              <Button
                variant="outline"
                size="sm"
                disabled={!canTest}
                aria-label="Test rule {i + 1}: {label.when}{label.filter ? ` ${label.filter}` : ''}"
                onclick={() => ontest(i)}
                class="col-start-3 row-start-2 md:col-start-6 md:row-start-1"
              >
                ▶ Test
              </Button>
            </li>
          {/each}
        </ol>
      </section>
    {/each}
  {:else}
    <RuleList rules={profile.rules} seatColors={profile.seatColors} {canTest} {onmove} {onenabled} {onedit} {onadd} {ontest} />
  {/if}
  {#if profile.builtIn}
    <span class="text-caption text-text-dim">
      The built-in default can't be edited and never touches your WLED presets. Duplicate it to make your own. Lobby shows only while you
      are in a lobby with no game running, and is off by default.
    </span>
  {/if}
</section>
