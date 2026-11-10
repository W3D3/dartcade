<script lang="ts">
  // Overview / Rewards / Achievements, the three pages of Progress. Achievements shows only where
  // achievements.enabled is on, with a "new" count of tiers you have not looked at yet.
  import { location } from 'svelte-spa-router'
  import { flag } from '$lib/flags'
  import { achievements } from '$lib/achievements/store'

  const on = flag('achievements.enabled')
  const tabs = $derived([
    { href: '#/progress', path: '/progress', name: 'Overview' },
    { href: '#/progress/rewards', path: '/progress/rewards', name: 'Rewards' },
    ...($on ? [{ href: '#/progress/achievements', path: '/progress/achievements', name: 'Achievements' }] : []),
  ])
  const fresh = $derived($on ? ($achievements?.unseen ?? 0) : 0)
</script>

{#if $on}
  <nav aria-label="Progress" class="flex shrink-0 gap-0 md:gap-1 overflow-x-auto border-b border-line">
    {#each tabs as t (t.path)}
      {@const active = $location === t.path || $location.startsWith(`${t.path}/`)}
      <a
        href={t.href}
        aria-current={active ? 'page' : undefined}
        class="-mb-px inline-flex items-center gap-2 whitespace-nowrap border-b-2 px-3 md:px-4 py-2 text-body font-semibold no-underline
               {active ? 'border-accent text-text' : 'border-transparent text-text-muted hover:text-text'}"
        >{t.name}{#if t.path === '/progress/achievements' && fresh > 0}<span
            class="rounded-full bg-accent px-[7px] text-caption whitespace-nowrap font-bold text-accent-fg">{fresh} new</span
          >{/if}</a
      >
    {/each}
  </nav>
{/if}
