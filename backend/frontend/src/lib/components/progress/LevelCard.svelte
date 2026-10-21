<script lang="ts">
  // The Progress page's level card (Progress board): the level, the XP bar and what's left to go.
  import type { Snippet } from 'svelte'
  import { fmtXp, levelView } from '$lib/progress/view'

  let { xp, children }: { xp: number; children?: Snippet } = $props()
  const v = $derived(levelView(xp))
</script>

<section aria-label="Level" class="flex flex-col gap-5 box-border rounded-[14px] border border-line-2 bg-surface-2 p-[18px] md:p-[22px]">
  <div class="flex items-baseline justify-between">
    <span class="text-[12px] label-caps text-text-dim">Level</span>
    <span class="text-[13px] text-text-muted">{fmtXp(v.xp)} XP total</span>
  </div>
  <div class="flex flex-wrap items-end gap-5">
    <span class="font-display font-bold text-[100px] md:text-[130px] leading-[0.8] tracking-[-0.01em]">{v.level}</span>
    {@render children?.()}
  </div>
  <div class="flex flex-col gap-2">
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
</section>
