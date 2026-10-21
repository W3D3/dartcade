<script lang="ts">
  // The Progress page's level card (Progress board): the level, the XP bar and what's left to go,
  // and everything the next level unlocks (each opens in the rewards below).
  import { fmtXp, levelView } from '$lib/progress/view'
  import { rewardFocus } from '$lib/progress/rewardFocus'
  import { PERKS, nextLevelPerk, perk, type PerkKind } from '$shared/progression.js'

  const KIND: Record<PerkKind, string> = { title: 'Title', banner: 'Banner', colors: 'Colours', picture: 'Picture' }

  let { xp, title, gain = null }: { xp: number; title: string | null; gain?: number | null } = $props()
  const v = $derived(levelView(xp))
  const next = $derived(nextLevelPerk(v.level))
  const nextLevel = $derived(next && 'level' in next.unlock ? next.unlock.level : null)
  // Several rewards can share a level
  const nextPerks = $derived(nextLevel === null ? [] : PERKS.filter(p => 'level' in p.unlock && p.unlock.level === nextLevel))
</script>

<section aria-label="Level" class="flex flex-col gap-5 box-border rounded-[14px] border border-line-2 bg-surface-2 p-[18px] md:p-[22px]">
  <div class="flex items-baseline justify-between">
    <span class="text-[12px] label-caps text-text-dim">Level</span>
    <span class="text-[13px] text-text-muted">{fmtXp(v.xp)} XP total</span>
  </div>
  <div class="flex flex-wrap items-end gap-5">
    <span class="font-display font-bold text-[100px] md:text-[130px] leading-[0.8] tracking-[-0.01em]">{v.level}</span>
    {#if title}
      <span class="pb-[6px]"
        ><span
          class="whitespace-nowrap rounded-full border border-line-chip px-4 py-2 font-display font-bold text-[15px] uppercase tracking-[0.12em]"
          >{perk(title)?.name}</span
        ></span
      >
    {/if}
  </div>
  <div class="relative flex flex-col gap-2">
    {#if gain}
      {#key gain}
        <span
          aria-hidden="true"
          class="rise absolute -top-[30px] -translate-x-1/2 font-display font-bold text-[20px] text-accent whitespace-nowrap"
          style="left: {Math.min(92, Math.max(8, v.pct))}%">+{fmtXp(gain)} XP</span
        >
      {/key}
    {/if}
    <div
      class="h-3 rounded-full bg-surface-inset overflow-hidden"
      role="progressbar"
      aria-label="XP to level {v.level + 1}"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(v.pct)}
    >
      <div class="h-full rounded-full bg-accent" style="width: {v.pct}%"></div>
    </div>
    <div class="flex justify-between text-[13px] text-text-muted">
      <span>Level {v.level}</span><span class="font-semibold text-text">{v.toGo}</span><span>Level {v.level + 1}</span>
    </div>
  </div>
  {#if nextLevel !== null}
    <div class="flex flex-wrap items-center gap-x-[14px] gap-y-2 rounded-[10px] bg-surface-inset px-[14px] py-3">
      <span
        class="size-9 shrink-0 rounded-full border-2 border-dashed border-line-pip flex items-center justify-center font-display font-bold text-[16px] text-text-muted"
        >{nextLevel}</span
      >
      <span class="text-[14px] text-ink-2">{nextPerks.length > 1 ? 'Next unlocks' : 'Next unlock'}</span>
      <span class="ml-auto flex flex-wrap justify-end gap-2 min-w-0">
        {#each nextPerks as p (p.id)}
          <button
            type="button"
            onclick={() => rewardFocus.set(p)}
            aria-label="{KIND[p.kind]}: {p.name}. Show it in the rewards"
            class="whitespace-nowrap rounded-full border border-line-chip bg-transparent px-3 py-[7px] text-text font-[inherit] cursor-pointer hover:border-line-strong"
            ><span class="mr-[6px] text-[11px] text-text-muted">{KIND[p.kind]}</span><span
              class="font-display font-bold text-[13px] uppercase tracking-[0.1em]">{p.name}</span
            ></button
          >
        {/each}
      </span>
    </div>
  {/if}
</section>

<style>
  .rise {
    opacity: 0;
    animation: rise 3s ease-out both;
  }
  @keyframes rise {
    0% {
      transform: translate(-50%, 8px);
      opacity: 0;
    }
    15% {
      opacity: 1;
    }
    100% {
      transform: translate(-50%, -34px);
      opacity: 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .rise {
      display: none;
    }
  }
</style>
