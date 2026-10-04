<script lang="ts">
  // The caller's voice in the game settings drawer: the user's packs ("Your voices", with their
  // clip counts) and the built-in voices, as a menu that opens upwards (Settings-InGame board).
  import { Select } from 'bits-ui'
  import { Check, ChevronUp } from '@lucide/svelte'
  import { BUILTIN_PREFIX, DEFAULT_BUILTIN, type BuiltinVoice } from '$lib/caller/voices.js'
  import type { VoicePackSummary } from '$lib/api'
  import { audioContext } from '$lib/sounds.js'

  let { value = $bindable(), packs, builtins, labelledby }: {
    /** A pack id or `builtin:<id>`; null for the default built-in voice. */
    value: string | null
    packs: VoicePackSummary[]
    builtins: BuiltinVoice[]
    labelledby: string
  } = $props()

  const builtinValue = (id: string) => `${BUILTIN_PREFIX}${id}`
  const items = $derived([
    ...packs.map(p => ({ value: p.id, label: p.name })),
    ...builtins.map(b => ({ value: builtinValue(b.id), label: b.name })),
  ])
  // No pick (or a pack deleted since) reads as the default built-in voice
  const current = $derived(items.find(i => i.value === value) ?? items.find(i => i.value === builtinValue(DEFAULT_BUILTIN)))
</script>

<!-- Picking a voice is a tap: it wakes the page's audio for the caller -->
<Select.Root type="single" value={current?.value ?? ''} onValueChange={(v: string) => { value = v; audioContext() }} {items} disabled={items.length === 0}>
  <Select.Trigger aria-labelledby={labelledby}
    class="h-11 min-w-[200px] max-w-[60%] px-[14px] pr-3 flex items-center justify-between gap-[10px] rounded-[10px]
           border border-line-3 data-[state=open]:border-accent bg-surface-inset text-text text-[15px] cursor-pointer
           disabled:cursor-not-allowed disabled:text-text-dim">
    <span class="truncate">{current?.label ?? 'No voices yet'}</span>
    <ChevronUp size={16} class="shrink-0" />
  </Select.Trigger>
  <Select.Portal>
    <Select.Content side="top" align="end" sideOffset={8}
      class="z-[60] w-[300px] max-w-[calc(100vw-32px)] max-h-[min(420px,var(--bits-select-content-available-height))] box-border p-[6px]
             rounded-xl bg-surface-hover border border-line-popover [box-shadow:0_18px_44px_rgba(0,0,0,0.55)] outline-none">
      <Select.Viewport class="flex flex-col gap-[2px]">
        {#if packs.length}
          <Select.Group>
            <Select.GroupHeading class="px-[10px] pt-[6px] pb-[2px] text-[11px] uppercase tracking-[0.1em] text-text-dim">Your voices</Select.GroupHeading>
            {#each packs as p (p.id)}
              {@render option(p.id, p.name, `${p.clips.toLocaleString('en-US')} clips`)}
            {/each}
          </Select.Group>
        {/if}
        {#if builtins.length}
          <Select.Group>
            <Select.GroupHeading class="px-[10px] pt-2 pb-[2px] text-[11px] uppercase tracking-[0.1em] text-text-dim">Built-in</Select.GroupHeading>
            {#each builtins as b (b.id)}
              {@render option(builtinValue(b.id), b.name, '')}
            {/each}
          </Select.Group>
        {/if}
      </Select.Viewport>
    </Select.Content>
  </Select.Portal>
</Select.Root>

{#snippet option(itemValue: string, label: string, meta: string)}
  <Select.Item value={itemValue} {label}
    class="h-10 px-[10px] flex items-center gap-[10px] rounded-lg cursor-pointer outline-none
           data-[highlighted]:bg-surface-paused data-[selected]:bg-surface-paused">
    {#snippet children({ selected })}
      <span class="flex-grow min-w-0 truncate text-[15px] text-text">{label}</span>
      {#if meta}<span class="text-[12px] text-text-dim whitespace-nowrap">{meta}</span>{/if}
      <span class="w-4 flex">{#if selected}<Check size={16} strokeWidth={3} class="text-accent" />{/if}</span>
    {/snippet}
  </Select.Item>
{/snippet}
