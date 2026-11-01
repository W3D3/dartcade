<script lang="ts">
  // The country select (Settings-Country board): the trigger shows the flag and the name (a dashed
  // placeholder box for none), the list opens below with a search box, a row per country with its
  // flag, and a tick on yours. Arrow keys move between the search box and the rows.
  import { Popover } from 'bits-ui'
  import { Check, ChevronDown, Search } from '@lucide/svelte'
  import Flag from '$lib/components/Flag.svelte'
  import { countryName, searchCountries } from '$lib/countries'

  let {
    value,
    onchange,
    label = 'Country',
  }: {
    /** The picked country's code; null for none. */
    value: string | null
    onchange: (code: string | null) => void
    label?: string
  } = $props()

  let open = $state(false)
  let query = $state('')
  let list = $state<HTMLElement | null>(null)

  const shown = $derived(searchCountries(query))
  // "Don't show a country" heads the full list only
  const showNone = $derived(query.trim() === '')

  const rows = () => [...(list?.querySelectorAll<HTMLElement>('[role="option"]') ?? [])]

  function pick(code: string | null) {
    open = false
    onchange(code)
  }

  function onKey(e: KeyboardEvent, from: number) {
    const all = rows()
    const to = e.key === 'ArrowDown' ? from + 1 : e.key === 'ArrowUp' ? from - 1 : null
    if (to === null) return
    e.preventDefault()
    if (to >= 0) all[Math.min(to, all.length - 1)]?.focus()
    else list?.parentElement?.querySelector<HTMLInputElement>('input')?.focus()
  }
</script>

{#snippet placeholder()}
  <span aria-hidden="true" class="h-4 w-6 flex-none rounded-[3px] border-[1.5px] border-dashed border-line-strong"></span>
{/snippet}

<Popover.Root bind:open onOpenChange={o => o && (query = '')}>
  <Popover.Trigger
    aria-label={label}
    class="flex h-[50px] w-full items-center gap-3 rounded-[10px] border border-line-chip bg-bg px-[14px] text-left text-[16px] text-text cursor-pointer
           font-[inherit] data-[state=open]:border-accent focus-visible:outline-2 focus-visible:outline-accent"
  >
    {#if value}
      <Flag code={value} size="md" />
      <span class="min-w-0 flex-1 truncate">{countryName(value)}</span>
    {:else}
      {@render placeholder()}
      <span class="min-w-0 flex-1 truncate text-text-muted">No country shown</span>
    {/if}
    <ChevronDown size={18} class="shrink-0 text-text-muted" />
  </Popover.Trigger>
  <Popover.Portal>
    <Popover.Content
      sideOffset={6}
      collisionPadding={8}
      align="start"
      class="z-[60] box-border flex w-[var(--bits-popover-anchor-width)] min-w-[260px] flex-col gap-[6px] rounded-[12px] border border-line-popover bg-surface-inset p-2
             outline-none shadow-[0_24px_60px_rgba(0,0,0,0.55)]"
    >
      <div class="flex h-11 items-center gap-[10px] rounded-[9px] border border-line-chip bg-bg px-3">
        <Search size={16} class="shrink-0 text-text-muted" aria-hidden="true" />
        <input
          type="search"
          bind:value={query}
          placeholder="Search countries"
          aria-label="Search countries"
          autocomplete="off"
          onkeydown={e => {
            if (e.key === 'ArrowDown') onKey(e, -1)
            else if (e.key === 'Enter' && shown[0]) pick(shown[0].value)
          }}
          class="min-w-0 flex-1 border-0 bg-transparent text-[15px] text-text outline-none placeholder:text-text-faint"
        />
      </div>
      <div
        bind:this={list}
        role="listbox"
        aria-label={label}
        class="flex max-h-[min(440px,var(--bits-popover-content-available-height))] flex-col gap-px overflow-auto"
      >
        {#if showNone}
          <button
            type="button"
            role="option"
            aria-selected={value === null}
            onclick={() => pick(null)}
            onkeydown={e => onKey(e, 0)}
            class="flex min-h-11 items-center gap-3 rounded-[9px] border-0 bg-transparent px-3 text-left text-[15px] text-text-muted cursor-pointer font-[inherit]
                   hover:bg-surface-key focus-visible:bg-surface-key focus-visible:outline-none"
          >
            {@render placeholder()}
            <span class="flex-1">Don’t show a country</span>
            {#if value === null}<Check size={18} class="text-accent" />{/if}
          </button>
        {/if}
        {#each shown as o, i (o.value)}
          <button
            type="button"
            role="option"
            aria-selected={value === o.value}
            onclick={() => pick(o.value)}
            onkeydown={e => onKey(e, i + (showNone ? 1 : 0))}
            class="flex min-h-11 items-center gap-3 rounded-[9px] border-0 bg-transparent px-3 text-left text-[15px] text-text cursor-pointer font-[inherit]
                   hover:bg-surface-key focus-visible:bg-surface-key focus-visible:outline-none"
          >
            <Flag code={o.value} size="md" />
            <span class="flex-1 truncate {value === o.value ? 'text-accent' : ''}">{o.label}</span>
            {#if value === o.value}<Check size={18} class="text-accent" />{/if}
          </button>
        {:else}
          <p class="m-0 px-3 py-4 text-[14px] text-text-muted">No country matches “{query.trim()}”.</p>
        {/each}
      </div>
    </Popover.Content>
  </Popover.Portal>
</Popover.Root>
