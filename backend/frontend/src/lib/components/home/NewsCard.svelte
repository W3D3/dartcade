<script lang="ts">
  // What's new (Home board): the latest changes the player can use (lib/home/news.ts).
  import HomeSection from './HomeSection.svelte'
  import { homeFlagOn } from '$lib/home/flags'
  import { NEWS, visibleNews } from '$lib/home/news'
  import { dayMonth } from '$lib/fmt'
  import { authInfo } from '$lib/authInfo'

  const items = $derived(visibleNews(NEWS, $homeFlagOn))
</script>

<HomeSection title="What's new" link={{ label: 'Changelog', href: 'https://github.com/W3D3/dartcade/releases' }}>
  {#if $authInfo.discordInviteUrl}
    <div class="mb-3 flex flex-col items-start gap-1">
      <span class="text-label font-semibold text-text">Join our Discord</span>
      <span class="text-label text-text-muted">Talk darts, share feedback and find players.</span>
      <a
        href={$authInfo.discordInviteUrl}
        target="_blank"
        rel="noopener noreferrer"
        class="mt-1 rounded-sm border border-accent-line-strong px-3 py-1 text-label font-semibold text-accent no-underline hover:bg-surface-active"
        >Join our Discord</a
      >
    </div>
  {/if}
  <ul class="flex flex-col gap-3">
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
