<script lang="ts">
  let { options, value = $bindable(), onchange, defaultValue, class: className = '' }: {
    options: { value: unknown; label: string }[]
    value?: unknown
    onchange?: (v: unknown) => void
    defaultValue?: unknown
    class?: string
  } = $props()

  function pick(v: unknown) {
    value = v
    onchange?.(v)
  }

  const isNonDefault = $derived(defaultValue !== undefined && value !== defaultValue)
</script>

<div class="flex gap-1 p-1 bg-bg rounded-[10px] {className}">
  {#each options as opt}
    <button type="button" onclick={() => pick(opt.value)}
      class="flex-1 h-10 rounded-[7px] text-[15px] transition-colors border-0 cursor-pointer
             {value === opt.value
               ? isNonDefault
                 ? 'bg-accent/15 text-accent font-semibold ring-1 ring-accent/40 ring-inset'
                 : 'bg-[#2a2d27] text-text font-semibold'
               : 'bg-transparent text-[#c9c9bf] font-medium'}">
      {opt.label}
    </button>
  {/each}
</div>
