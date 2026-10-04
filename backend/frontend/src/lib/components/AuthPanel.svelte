<script lang="ts">
  // The sign-in and register brand panel, md and up. Tablets (md up to xl) get a narrower one,
  // headline under the logo and the board in the corner, so the form keeps its 400 px beside it.
  import BrandMark from './BrandMark.svelte'
  import AuthBoard from './AuthBoard.svelte'
</script>

<div class="relative hidden md:flex w-[clamp(320px,calc(100vw-460px),500px)] xl:w-[820px] flex-shrink-0 flex-col gap-10 xl:gap-0 xl:justify-between overflow-hidden
            bg-surface-1 border-r border-line box-border p-[40px_44px] xl:p-[48px_56px]">

  <!-- Logo -->
  <div class="relative flex items-center gap-3">
    <BrandMark size={32} />
    <span class="font-display font-bold text-[26px] xl:text-[28px] tracking-[0.06em]">DARTCADE</span>
  </div>

  <!-- Dartboard illustration (bleeds off right edge) -->
  <div class="absolute right-[-250px] top-[110px] opacity-95 pointer-events-none hidden xl:block">
    <AuthBoard size={640} />
  </div>
  <div class="absolute right-[-210px] bottom-[-160px] opacity-90 pointer-events-none xl:hidden">
    <AuthBoard size={520} />
  </div>

  <!-- Headline -->
  <div class="relative flex flex-col gap-5 xl:gap-6 xl:w-[470px]">
    <div class="font-mono text-[13px] tracking-[0.08em] text-accent">T20 · T20 · T20 — 180</div>
    <h2 class="m-0 font-display font-bold text-[80px] xl:text-[104px] leading-[0.88] tracking-[0.01em] uppercase">
      Step up to the oche.
    </h2>
    <p class="m-0 text-[17px] xl:text-[18px] leading-[1.55] text-text-muted max-w-[380px] xl:max-w-[430px]">
      Custom minigames, 501 and tournaments — scored live from your Autodarts board.
    </p>
    <div class="hidden xl:flex gap-2 flex-wrap">
      {#each ['501','Dart Soccer','Challenges','Tournaments'] as label (label)}
        <span class="px-[14px] py-2 border border-[#3a3e36] rounded-full text-[14px] text-[#d8d8ce]">
          {label}
        </span>
      {/each}
    </div>
  </div>
</div>
