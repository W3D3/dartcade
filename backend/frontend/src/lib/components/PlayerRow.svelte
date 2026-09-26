<script lang="ts">
  let { index, name = $bindable(''), isYou = false, onRemove }: {
    index: number
    name: string
    isYou?: boolean
    onRemove?: () => void
  } = $props()

  const initial = $derived((name || (isYou ? 'Y' : 'G'))[0].toUpperCase())
</script>

<div class="flex items-center gap-3 h-12 px-3 bg-[#1b1d18] rounded-[10px]">
  <span class="font-mono text-[12px] text-[#7d7f74] shrink-0 w-3 text-center">{index}</span>
  <span class="w-7 h-7 rounded-full flex items-center justify-center font-bold text-[13px] shrink-0
               {isYou ? 'bg-accent text-accent-fg' : 'bg-[#3a3e36] text-text'}">
    {initial}
  </span>
  {#if isYou}
    <span class="text-[15px] font-semibold flex-grow text-text">{name || 'You'}</span>
    <span class="text-[12px] text-text-dim shrink-0">You</span>
  {:else}
    <input bind:value={name} placeholder="Guest {index}"
      class="text-[15px] font-semibold flex-grow bg-transparent border-0 outline-none
             text-text placeholder:text-text-dim min-w-0" />
    <span class="text-[12px] text-text-dim shrink-0">Guest</span>
    {#if onRemove}
      <button type="button" onclick={onRemove}
        class="w-7 h-7 flex items-center justify-center text-text-dim hover:text-live-text
               transition-colors border-0 bg-transparent cursor-pointer shrink-0 text-[16px]">
        ✕
      </button>
    {/if}
  {/if}
</div>
