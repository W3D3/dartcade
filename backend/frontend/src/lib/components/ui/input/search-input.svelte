<!-- A search field: a magnifier and a borderless input in one outlined box. `label` is its placeholder and accessible name; `class` sets the width. -->
<script lang="ts">
  import { Search } from '@lucide/svelte'
  import { cn } from '$lib/utils.js'

  let {
    value = $bindable(''),
    label,
    oninput,
    class: className,
  }: { value?: string; label: string; oninput?: (value: string) => void; class?: string } = $props()
</script>

<label class={cn('flex h-11 items-center gap-2 rounded-[10px] border border-line-3 px-3 text-text-muted', className)}>
  <Search size={16} />
  <input
    type="search"
    bind:value
    oninput={e => oninput?.(e.currentTarget.value)}
    placeholder={label}
    aria-label={label}
    class="min-w-0 flex-grow border-0 bg-transparent text-[14px] text-text outline-none"
  />
</label>
