<script lang="ts">
  // The card around a chart or list (Stats.dc.html .card + .ch): a title, a note beside it, an
  // optional legend or control on the right, then the content.
  import type { Snippet } from 'svelte'

  let { title, note, id, aside, children }: { title: string; note?: string; id?: string; aside?: Snippet; children: Snippet } = $props()
  const uid = $props.id()
  const titleId = $derived(`${id ?? uid}-title`)
</script>

<section {id} aria-labelledby={titleId} class="card flex min-w-0 scroll-mt-4 flex-col gap-3 px-4 py-4 sm:px-5 sm:py-[18px]">
  <div class="flex flex-wrap items-baseline gap-x-2.5 gap-y-1.5">
    <h3 id={titleId} class="text-[15px] font-semibold">{title}</h3>
    {#if note}<span class="text-[12px] text-text-dim">{note}</span>{/if}
    {#if aside}<div class="ml-auto">{@render aside()}</div>{/if}
  </div>
  {@render children()}
</section>
