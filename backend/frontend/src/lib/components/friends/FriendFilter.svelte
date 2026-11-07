<script lang="ts">
  // The Friends page's filter: type part of a name to narrow the lists below.
  import { Search } from '@lucide/svelte'
  import { Input } from '$lib/components/ui/input/index.js'

  let { value, onchange, class: className = '' }: { value: string; onchange: (v: string) => void; class?: string } = $props()
</script>

<div class="relative {className}">
  <label for="filter-friends" class="sr-only">Filter your friends</label>
  <Search size={16} class="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim pointer-events-none" />
  <Input
    id="filter-friends"
    type="search"
    {value}
    oninput={(e: Event & { currentTarget: HTMLInputElement }) => onchange(e.currentTarget.value)}
    placeholder="Filter your friends"
    autocomplete="off"
    spellcheck="false"
    class="w-full h-11 pl-9 pr-3 rounded-[9px] border-line-chip bg-surface-panel text-[14px]"
  />
</div>
