<script lang="ts">
  // The sign-in and register brand panel, md and up. Tablets (md up to xl) get a narrower one,
  // headline under the logo and the board in the corner, so the form keeps its 400 px beside it.
  // Register swaps the dartboard and copy for the outlined "180" and the three-step list
  // (see Register.dc.html).
  import Wordmark from './Wordmark.svelte'
  import AuthBoard from './AuthBoard.svelte'

  let { variant = 'signin' }: { variant?: 'signin' | 'register' } = $props()

  const steps = [
    { title: 'Create your account', desc: 'Pick the name that shows up on scoreboards.' },
    { title: 'Connect your board', desc: 'Run the Dartcade bridge next to your Autodarts Board Manager.' },
    { title: 'Pick a game and throw', desc: 'Every dart is scored live — no typing numbers in.' },
  ]
</script>

<div
  class="relative hidden md:flex w-[clamp(320px,calc(100vw-460px),500px)] xl:w-[820px] flex-shrink-0 flex-col gap-10 xl:gap-0 xl:justify-between overflow-hidden
            bg-surface-1 border-r border-line box-border p-[40px_44px] xl:p-[48px_56px]"
>
  <!-- Logo -->
  <Wordmark size={32} text="text-[26px] xl:text-[28px]" />

  {#if variant === 'register'}
    <!-- Outlined "180", bleeding off the top-right corner -->
    <div
      class="absolute pointer-events-none select-none font-display font-bold leading-none text-transparent uppercase
             right-[-24px] top-[16px] text-[320px] xl:right-[-40px] xl:top-[40px] xl:text-[520px]
             [-webkit-text-stroke:2px_var(--color-surface-key)] [letter-spacing:-0.02em]"
      aria-hidden="true"
    >
      180
    </div>

    <!-- Headline + the three steps -->
    <div class="relative flex flex-col gap-8 xl:gap-10">
      <h2 class="m-0 font-display font-bold text-[72px] xl:text-[96px] leading-[0.88] uppercase max-w-[480px] xl:max-w-[620px]">
        Three darts.<br />Endless games.
      </h2>
      <ol class="m-0 p-0 list-none flex flex-col max-w-[560px] border-t border-line-2">
        {#each steps as step, i (step.title)}
          <li class="flex gap-4 xl:gap-6 py-4 xl:py-5 border-b border-line-2">
            <span class="font-mono text-[14px] pt-[3px] {i === 0 ? 'text-accent' : 'text-ink-faint'}">{String(i + 1).padStart(2, '0')}</span
            >
            <div class="flex flex-col gap-1">
              <span class="text-base xl:text-[18px] font-semibold">{step.title}</span>
              <span class="text-[14px] xl:text-[15px] text-text-muted">{step.desc}</span>
            </div>
          </li>
        {/each}
      </ol>
    </div>
  {:else}
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
        Custom minigames, X01 and tournaments — scored live from your Autodarts board.
      </p>
      <div class="hidden xl:flex gap-2 flex-wrap">
        {#each ['X01', 'Dart Soccer', 'Challenges', 'Tournaments'] as label (label)}
          <span class="px-[14px] py-2 border border-line-chip rounded-full text-[14px] text-ink-soft">
            {label}
          </span>
        {/each}
      </div>
    </div>
  {/if}
</div>
