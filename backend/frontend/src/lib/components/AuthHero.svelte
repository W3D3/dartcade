<script lang="ts">
  // Sign-in hero for phones (below md); the desktop shows AuthPanel instead.
  import AuthBoard from './AuthBoard.svelte'
  import BrandMark from './BrandMark.svelte'
</script>

<div
  class="md:hidden relative shrink-0 h-[250px] box-border px-5 py-6 bg-surface-1 border-b border-line overflow-hidden flex flex-col justify-between"
>
  <div class="absolute right-[-120px] top-[-40px] opacity-85 pointer-events-none" aria-hidden="true">
    <AuthBoard size={300} />
  </div>
  <div class="relative flex items-center gap-[10px]">
    <BrandMark size={28} />
    <span class="font-display font-bold text-[22px] tracking-[0.06em]">DARTCADE</span>
  </div>
  <div class="relative flex flex-col gap-[10px]">
    <span class="font-[JetBrains_Mono,monospace] text-[12px] tracking-[0.08em] text-accent">T20 · T20 · T20 — 180</span>
    <p class="m-0 font-display font-bold text-[52px] leading-[0.88] uppercase max-w-[250px]">Step up to the oche.</p>
  </div>
</div>
