<script lang="ts">
  import { normalizePairingCode, extractPairingCode, CODE_LENGTH } from '$lib/pairing'

  let {
    value = $bindable(''),
    length = CODE_LENGTH,
    groupAt = 4,
    invalid = false,
    onfocus,
    oninput,
    label = 'Code',
  }: {
    value?: string
    length?: number
    groupAt?: number
    invalid?: boolean
    onfocus?: () => void
    oninput?: (value: string) => void
    /** Accessible name of the code field. */
    label?: string
  } = $props()

  let focused = $state(false)
  let inputEl: HTMLInputElement | undefined

  const activeIndex = $derived(Math.min(value.length, length - 1))

  function onInput(e: Event & { currentTarget: HTMLInputElement }) {
    value = normalizePairingCode(e.currentTarget.value)
    oninput?.(value)
  }

  function onPaste(e: ClipboardEvent) {
    const text = e.clipboardData?.getData('text') ?? ''
    const extracted = extractPairingCode(text)
    if (extracted) {
      e.preventDefault()
      value = extracted
      oninput?.(value)
    }
  }

  export function focus() {
    inputEl?.focus()
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="relative flex items-center gap-2" onclick={() => inputEl?.focus()}>
  {#each Array(length) as _, i (i)}
    {#if groupAt > 0 && i === groupAt}
      <span class="text-text-dim font-mono px-0.5">–</span>
    {/if}
    <div
      class="flex-1 aspect-[3/4] max-w-[46px] flex items-center justify-center rounded-[10px]
             font-mono text-[24px] font-semibold border transition-colors
             {invalid
        ? 'border-live bg-live/5 text-text'
        : i === activeIndex && focused
          ? 'border-accent bg-surface-2 text-text'
          : 'border-line-2 bg-surface-2 text-text'}"
    >
      {value[i] ?? ''}
      {#if i === activeIndex && focused && !value[i]}
        <span class="w-[2px] h-[26px] bg-accent animate-pulse"></span>
      {/if}
    </div>
  {/each}
  <input
    bind:this={inputEl}
    {value}
    oninput={onInput}
    onpaste={onPaste}
    onfocus={() => {
      focused = true
      onfocus?.()
    }}
    onblur={() => (focused = false)}
    inputmode="text"
    autocapitalize="characters"
    autocomplete="off"
    spellcheck="false"
    aria-label={label}
    class="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
  />
</div>
