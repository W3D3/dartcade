<script lang="ts">
  // What's new (Home board): the latest changes the player can use (lib/home/news.ts).
  import HomeSection from './HomeSection.svelte'
  import { homeFlagOn } from '$lib/home/flags'
  import { NEWS, visibleNews } from '$lib/home/news'
  import { dayMonth } from '$lib/fmt'

  const items = $derived(visibleNews(NEWS, $homeFlagOn))
</script>

<HomeSection title="What's new" link={{ label: 'Changelog', href: 'https://github.com/W3D3/dartcade/releases' }}>
  <ul class="m-0 flex list-none flex-col gap-3 p-0">
    {#each items as item (item.id)}
      <li class="flex flex-col gap-[2px]">
        <span class="flex items-baseline justify-between gap-3">
          <a href={item.href} class="text-[15px] font-semibold text-text no-underline hover:text-accent">{item.title}</a>
          <span class="shrink-0 text-[12px] text-text-dim">{dayMonth(new Date(`${item.date}T12:00:00`))}</span>
        </span>
        <span class="text-[13px] text-text-muted">{item.text}</span>
      </li>
    {/each}
  </ul>
</HomeSection>
