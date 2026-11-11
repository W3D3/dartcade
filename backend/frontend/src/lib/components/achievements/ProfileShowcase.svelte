<script lang="ts">
  // The badges a player picked for their profile (Profile-Lena-Achievements board), above the
  // overview; "See all" opens the Achievements tab. Nothing shows while they picked none.
  import { hrefs } from '$lib/routes'
  import Badge from './Badge.svelte'
  import { badgesOf, statusLine, type Achievements } from '$lib/achievements/view'

  let { data, self, name, seeAll }: { data: Achievements; self: boolean; name: string; seeAll: () => void } = $props()
  const picked = $derived(data.showcase.flatMap(id => badgesOf(data).filter(b => b.def.id === id)))
</script>

{#if picked.length > 0 || self}
  <section aria-label="Showcase" class="card box-border flex flex-col gap-3 p-[18px] md:p-[22px]">
    <div class="flex items-baseline justify-between gap-3">
      <span class="text-caption label-caps text-text-dim">{self ? 'Your' : `${name}’s`} showcase</span>
      <span class="flex items-baseline gap-4">
        <span class="hidden text-small text-text-muted sm:inline">{self ? 'Picked by you' : `Picked by ${name}`}</span>
        <button type="button" onclick={seeAll} class="cursor-pointer border-0 text-small font-semibold text-accent">See all ›</button>
      </span>
    </div>
    {#if picked.length === 0}
      <p class="text-label text-text-muted">
        Nothing shown yet. <a href={hrefs.achievements()} class="text-accent no-underline">Pick up to five on the Achievements page</a>.
      </p>
    {:else}
      <ul class="flex flex-wrap gap-x-6 gap-y-4 p-0">
        {#each picked as b (b.def.id)}
          <li class="flex w-[104px] flex-col items-center gap-1 text-center">
            <Badge badge={b} size={88} />
            <span class="text-kicker/tight font-semibold">{b.def.name}</span>
            <span class="text-caption text-text-dim">{statusLine(b)}</span>
          </li>
        {/each}
      </ul>
    {/if}
  </section>
{/if}
