<script lang="ts">
  // A numbered card of the create tournament form (Tournament-Create's sections).
  import type { Snippet } from 'svelte'

  let { n, title, children }: { n: number; title: string; children: Snippet } = $props()
  const id = $derived(`tc-section-${n}`)
</script>

<section aria-labelledby={id} class="card flex min-w-0 flex-col gap-4 p-[18px] md:px-[22px] md:py-5">
  <div class="flex items-center gap-3">
    <span
      aria-hidden="true"
      class="flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-chip font-display text-body-lg font-bold text-accent"
      >{n}</span
    >
    <h2 {id} class="font-display text-player-name font-bold uppercase">{title}</h2>
  </div>
  {@render children()}
</section>
