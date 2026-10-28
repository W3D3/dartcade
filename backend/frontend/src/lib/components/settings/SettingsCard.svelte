<!-- A Settings card: its title and a line under it, then the settings. `class` sets the gap and width. -->
<script lang="ts">
  import type { Snippet } from 'svelte'

  let {
    id,
    title,
    description,
    class: className = 'gap-[14px]',
    children,
  }: { id: string; title: string; description: string; class?: string; children: Snippet } = $props()
</script>

<section aria-labelledby={id} class="box-border p-4 md:p-[22px] card flex flex-col {className}">
  <div class="flex flex-col gap-1">
    <h2 {id} class="m-0 text-[17px] font-semibold">{title}</h2>
    <p class="m-0 text-[13px] leading-[1.5] text-text-dim">{description}</p>
  </div>
  {@render children()}
</section>
