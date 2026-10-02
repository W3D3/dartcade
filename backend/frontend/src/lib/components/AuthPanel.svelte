<script lang="ts">
  import BrandMark from './BrandMark.svelte'
  import AuthBoard from './AuthBoard.svelte'
</script>

<div class="relative hidden md:flex w-[820px] flex-shrink-0 flex-col justify-between overflow-hidden
            bg-surface-1 border-r border-line box-border p-[48px_56px]">

  <!-- Logo -->
  <div class="relative flex items-center gap-3">
    <BrandMark size={32} />
    <span class="font-display font-bold text-[28px] tracking-[0.06em]">DARTCADE</span>
  </div>

  <!-- Dartboard illustration (bleeds off right edge) -->
  <div class="absolute right-[-250px] top-[110px] opacity-95 pointer-events-none">
    <AuthBoard size={640} />
  </div>

  <!-- Headline -->
  <div class="relative flex flex-col gap-6 w-[470px]">
    <div class="font-mono text-[13px] tracking-[0.08em] text-accent">T20 · T20 · T20 — 180</div>
    <h2 class="m-0 font-display font-bold text-[104px] leading-[0.88] tracking-[0.01em] uppercase">
      Step up to the oche.
    </h2>
    <p class="m-0 text-[18px] leading-[1.55] text-text-muted max-w-[430px]">
      Custom minigames, 501 and tournaments — scored live from your Autodarts board.
    </p>
    <div class="flex gap-2 flex-wrap">
      {#each ['501','Dart Soccer','Challenges','Tournaments'] as label (label)}
        <span class="px-[14px] py-2 border border-[#3a3e36] rounded-full text-[14px] text-[#d8d8ce]">
          {label}
        </span>
      {/each}
    </div>
  </div>
</div>
