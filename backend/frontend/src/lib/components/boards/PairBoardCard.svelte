<script lang="ts">
  // Tablets: pairing a new board, as a card in the boards grid. Entering the code opens the pairing dialog.
  import { Plus } from '@lucide/svelte'

  let { onpair }: { onpair: () => void } = $props()
</script>

<article class="box-border p-5 rounded-[14px] border border-dashed border-line-dashed flex flex-col gap-3">
  <h2 class="m-0 font-display font-bold text-[24px] leading-none uppercase">Pair a new board</h2>
  <p class="m-0 text-[14px] leading-[1.5] text-text-muted">Install the bridge on the Board Manager's network, then enter the code it prints.</p>
  <button type="button" onclick={onpair}
    class="mt-auto self-start h-11 px-4 inline-flex items-center gap-2 rounded-[8px] border-0 bg-line text-text text-[14px] font-semibold cursor-pointer font-[inherit]">
    <Plus size={16} strokeWidth={2.4} />Enter pairing code
  </button>
</article>
