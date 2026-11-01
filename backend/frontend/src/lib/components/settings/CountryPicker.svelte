<script lang="ts">
  // The country select (Settings-Country board), a bits-ui Combobox: the field shows the flag and
  // the name (a dashed placeholder box for none) and takes the search while open; the list below
  // has a row per country with its flag and a tick on yours. Typing filters, the arrow keys, Home,
  // End and Enter work from the field, which keeps the focus.
  import { Combobox } from 'bits-ui'
  import { Check, ChevronDown } from '@lucide/svelte'
  import Flag from '$lib/components/Flag.svelte'
  import { COUNTRY_OPTIONS, countryName, searchCountries } from '$lib/countries'

  // The item for "no country"; not an ISO code, so it can't clash with one
  const NONE = 'none'

  let {
    value,
    onchange,
    labelledby,
  }: {
    /** The picked country's code; null for none. */
    value: string | null
    onchange: (code: string | null) => void
    /** The id of the visible heading that names the field; the picked country is the input's value. */
    labelledby: string
  } = $props()

  let open = $state(false)
  let typed = $state('')
  $effect(() => {
    if (!open) typed = ''
  })

  const name = $derived(value ? countryName(value) : '')
  // The field shows the country when closed and the search while open
  const inputValue = $derived(open ? typed : name)
  const shown = $derived(searchCountries(typed))
  // "Don't show a country" heads the full list only
  const showNone = $derived(typed.trim() === '')
  const itemClass =
    'flex min-h-11 w-full items-center gap-3 rounded-[9px] px-3 text-left text-[15px] text-text cursor-pointer outline-none data-[highlighted]:bg-surface-key'
</script>

{#snippet placeholder()}
  <span aria-hidden="true" class="h-4 w-6 flex-none rounded-[3px] border-[1.5px] border-dashed border-line-strong"></span>
{/snippet}

<Combobox.Root
  type="single"
  allowDeselect={false}
  bind:open
  {inputValue}
  value={value ?? NONE}
  onValueChange={(v: string) => onchange(v === NONE ? null : v)}
  items={[{ value: NONE, label: 'Don’t show a country' }, ...COUNTRY_OPTIONS]}
>
  <div class="relative">
    <span class="pointer-events-none absolute inset-y-0 left-[14px] flex items-center">
      {#if value}<Flag code={value} size="md" />{:else}{@render placeholder()}{/if}
    </span>
    <Combobox.Input
      aria-labelledby={labelledby}
      placeholder={open ? 'Search countries' : 'No country shown'}
      autocomplete="off"
      oninput={e => (typed = e.currentTarget.value)}
      onclick={() => (open = true)}
      class="h-[50px] w-full box-border rounded-[10px] border border-line-chip bg-bg pl-[50px] pr-11 text-[16px] text-text font-[inherit]
             placeholder:text-text-muted focus-visible:border-accent focus-visible:outline-none"
    />
    <Combobox.Trigger
      aria-label="Show countries"
      tabindex={-1}
      class="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-text-muted"
    >
      <ChevronDown size={18} />
    </Combobox.Trigger>
  </div>
  <Combobox.Portal>
    <Combobox.Content
      sideOffset={6}
      collisionPadding={8}
      class="z-[60] box-border w-[var(--bits-floating-anchor-width)] min-w-[260px] rounded-[12px] border border-line-popover bg-surface-inset p-2
             outline-none shadow-[0_24px_60px_rgba(0,0,0,0.55)]"
    >
      <Combobox.Viewport class="flex max-h-[min(440px,var(--bits-floating-available-height))] flex-col gap-px overflow-auto">
        {#if showNone}
          <Combobox.Item value={NONE} label="Don’t show a country" class="{itemClass} !text-text-muted">
            {#snippet children({ selected })}
              {@render placeholder()}
              <span class="flex-1">Don’t show a country</span>
              {#if selected}<Check size={18} class="text-accent" />{/if}
            {/snippet}
          </Combobox.Item>
        {/if}
        {#each shown as o (o.value)}
          <Combobox.Item value={o.value} label={o.label} class={itemClass}>
            {#snippet children({ selected })}
              <Flag code={o.value} size="md" />
              <span class="flex-1 truncate {selected ? 'text-accent' : ''}">{o.label}</span>
              {#if selected}<Check size={18} class="text-accent" />{/if}
            {/snippet}
          </Combobox.Item>
        {:else}
          <p class="m-0 px-3 py-4 text-[14px] text-text-muted">No country matches “{typed.trim()}”.</p>
        {/each}
      </Combobox.Viewport>
    </Combobox.Content>
  </Combobox.Portal>
</Combobox.Root>
