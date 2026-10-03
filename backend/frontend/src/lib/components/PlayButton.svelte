<script lang="ts">
  // The Play page's main button: Create lobby, Continue in lobby or Open lobby.
  import { ArrowRight } from '@lucide/svelte'

  let { label, busy = false, onclick }: { label: string; busy?: boolean; onclick: () => void } = $props()
</script>

<button type="button" {onclick} disabled={busy}
  class="h-12 md:h-14 flex items-center justify-center gap-[10px] bg-accent text-accent-fg
         rounded-[10px] font-display font-bold text-[20px] md:text-[22px] tracking-[0.08em] uppercase
         border-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
  {busy ? 'Opening…' : label}
  {#if !busy}<ArrowRight size={20} strokeWidth={2.2} />{/if}
</button>
