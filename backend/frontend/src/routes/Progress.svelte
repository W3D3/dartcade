<script lang="ts">
  // Progress (Progress / Mobile-Progress boards): your level and XP. Behind progression.enabled;
  // without it the page says it isn't on. Rules: shared/progression.ts.
  import { LoaderCircle } from '@lucide/svelte'
  import Layout from '$lib/components/Layout.svelte'
  import LevelCard from '$lib/components/progress/LevelCard.svelte'
  import { flag } from '$lib/flags'
  import { progressXp } from '$lib/progress/store'

  const progression = flag('progression.enabled')
</script>

<Layout title="Progress">
  <main
    class="flex flex-grow min-h-0 flex-col gap-4 md:gap-6 box-border min-w-0 overflow-y-auto px-4 pt-6 pb-5 md:px-[30px] md:py-7 xl:px-11 xl:py-10"
  >
    <header>
      <div class="text-[12px] label-caps text-text-dim">Your progress</div>
      <h1 class="m-0 mt-1 font-display font-bold text-[40px] xl:text-[48px] leading-none uppercase tracking-[0.02em]">Progress</h1>
    </header>

    {#if !$progression}
      <p class="m-0 text-[15px] text-text-muted">Progress isn't on for your account yet.</p>
    {:else if $progressXp === null}
      <div class="flex justify-center py-10 text-text-muted"><LoaderCircle class="animate-spin" size={24} aria-label="Loading" /></div>
    {:else}
      <div class="grid gap-4 md:gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <LevelCard xp={$progressXp} />
      </div>
    {/if}
  </main>
</Layout>
