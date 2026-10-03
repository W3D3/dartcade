<script lang="ts">
  // The Play page's main button: Create lobby, Continue in lobby or Open lobby (disabled, with a
  // neutral label, while the page doesn't know yet which one you get).
  import { ArrowRight } from '@lucide/svelte'

  let { label, busy = false, disabled = false, onclick }: { label: string; busy?: boolean; disabled?: boolean; onclick: () => void } = $props()
</script>

<button type="button" {onclick} disabled={busy || disabled}
  class="h-12 md:h-14 flex items-center justify-center gap-[10px] bg-accent text-accent-fg
         rounded-[10px] font-display font-bold text-[20px] md:text-[22px] tracking-[0.08em] uppercase
         border-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
  {busy ? 'Opening…' : label}
  {#if !busy && !disabled}<ArrowRight size={20} strokeWidth={2.2} />{/if}
</button>
