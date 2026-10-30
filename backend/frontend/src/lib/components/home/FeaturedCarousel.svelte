<script lang="ts">
  // Featured (Home board): new things worth a look, one banner at a time. Arrows and dots appear
  // only with more than one. The page passes only the slides the player has (see lib/home/featured.ts).
  import { ArrowRight, ChevronLeft, ChevronRight, Lightbulb } from '@lucide/svelte'
  import { Button } from '$lib/components/ui/button/index.js'
  import HomeSection from './HomeSection.svelte'
  import type { FeaturedSlide } from '$lib/home/featured'

  let { slides }: { slides: FeaturedSlide[] } = $props()

  let picked = $state(0)
  // Slides can drop out while flags load; stay on one that exists
  const index = $derived(Math.min(picked, slides.length - 1))
  const current = $derived(slides[index])
  const step = (by: number) => (picked = (index + by + slides.length) % slides.length)
</script>

{#if current}
  <HomeSection title="Featured">
    <div class="flex flex-col gap-4 md:flex-row md:items-center" role="group" aria-roledescription="slide" aria-label={current.title}>
      <div class="flex min-w-0 flex-1 flex-col items-start gap-2">
        <span class="text-[11px] font-semibold tracking-[0.12em] text-accent">{current.badge}</span>
        <h3 class="m-0 font-display text-[34px] font-bold uppercase leading-none">{current.title}</h3>
        <p class="m-0 max-w-[52ch] text-[15px] text-text-muted">{current.text}</p>
        <Button href={current.primary.href} variant="accent" class="mt-1">{current.primary.label}<ArrowRight size={16} /></Button>
      </div>
      <div class="flex h-[140px] w-full items-center justify-center rounded-[12px] bg-surface-1 md:w-[260px]" aria-hidden="true">
        {#if current.img}
          <img src={current.img} alt="" class="h-full w-full rounded-[12px] object-contain p-2" />
        {:else if current.icon === 'lights'}
          <Lightbulb size={56} strokeWidth={1.4} class="text-accent" />
        {/if}
      </div>
    </div>
    {#if slides.length > 1}
      <div class="flex items-center justify-between">
        <div class="flex gap-2" role="group" aria-label="Choose a banner">
          {#each slides as slide, i (slide.id)}
            <button
              type="button"
              class="size-2 cursor-pointer rounded-full border-0 p-0 {slide.id === current.id ? 'bg-accent' : 'bg-line-3'}"
              aria-label="Show {slide.title}"
              aria-current={slide.id === current.id}
              onclick={() => (picked = i)}
            ></button>
          {/each}
        </div>
        <div class="flex gap-1">
          <Button variant="ghost" size="icon-sm" aria-label="Previous banner" onclick={() => step(-1)}><ChevronLeft size={16} /></Button>
          <Button variant="ghost" size="icon-sm" aria-label="Next banner" onclick={() => step(1)}><ChevronRight size={16} /></Button>
        </div>
      </div>
    {/if}
  </HomeSection>
{/if}
