<script lang="ts">
  // Your showcase (Achievements board): up to five earned badges, in order, shown on your profile
  // and in your profile card. Each slot has a remove cross; empty slots say so.
  import { X } from '@lucide/svelte'
  import Badge from './Badge.svelte'
  import { statusLine, type Badge as BadgeData } from '$lib/achievements/view'

  let { slots, max, remove }: { slots: BadgeData[]; max: number; remove: (id: string) => void } = $props()
</script>

<section aria-label="Showcase" class="card box-border flex flex-col gap-3 p-4 max-[360px]:p-3 md:p-[18px]">
  <div class="flex flex-wrap items-baseline justify-between gap-x-4">
    <div class="flex items-baseline gap-3">
      <span class="text-caption label-caps text-text-dim">Showcase</span>
      <span class="font-display font-bold text-lead tabular-nums">{slots.length} <span class="text-text-dim">/ {max}</span></span>
    </div>
    <a href="#/profile" class="text-small font-semibold text-accent no-underline">See your profile ›</a>
  </div>
  <p class="text-small text-text-muted">
    Pick up to {max} earned achievements. They show on your profile and in your profile card, in this order.
  </p>
  <ul class="grid grid-cols-5 gap-2 p-0 max-[360px]:gap-1 md:gap-3">
    {#each Array.from({ length: max }, (_, i) => slots.at(i)) as b, i (i)}
      <li
        class="relative flex min-w-0 flex-col items-center gap-1 rounded-lg bg-surface-inset py-3 {b
          ? 'px-1'
          : 'px-0.5 border border-dashed border-line-strong'}"
      >
        {#if b}
          <button
            type="button"
            onclick={() => remove(b.def.id)}
            aria-label="Remove {b.def.name} from the showcase"
            class="absolute right-1 top-1 flex size-6 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent text-text-dim hover:text-text"
            ><X size={14} /></button
          >
          <!-- The badge shrinks with the cell on a narrow phone instead of spilling over its neighbours -->
          <span class="block w-full max-w-16 [&>svg]:h-auto [&>svg]:w-full"><Badge badge={b} size={64} label={false} /></span>
          <span class="w-full truncate text-center text-caption font-semibold">{b.def.name}</span>
          <span class="hidden w-full truncate text-center text-caption text-text-dim md:block">{statusLine(b)}</span>
        {:else}
          <!-- w-min: the box is as wide as "Empty", so the text wraps between the words and never inside one -->
          <span class="my-auto w-min text-center text-caption leading-tight text-text-dim">Empty slot</span>
        {/if}
      </li>
    {/each}
  </ul>
</section>
