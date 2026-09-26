<script lang="ts">
  let { text, class: className = '' }: { text: string; class?: string } = $props()
  let visible = $state(false)
</script>

<span class="relative inline-flex items-center {className}"
  onmouseenter={() => visible = true}
  onmouseleave={() => visible = false}
  onfocus={() => visible = true}
  onblur={() => visible = false}>
  <button type="button" tabindex="0" aria-label="More information"
    class="w-[18px] h-[18px] rounded-full border border-line-3 flex items-center justify-center
           text-[11px] font-bold text-text-dim bg-transparent cursor-help leading-none">
    ?
  </button>
  {#if visible}
    <span role="tooltip"
      class="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 z-50
             w-[220px] px-3 py-2 rounded-[8px] text-[13px] leading-[1.45] text-text
             bg-[#1e211b] border border-line-3 [box-shadow:0_4px_16px_rgba(0,0,0,0.5)]
             pointer-events-none whitespace-normal">
      {text}
    </span>
  {/if}
</span>
