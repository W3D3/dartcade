<!-- A profile card while its data loads, built from the same boxes as the real one (ProfileCard for the
     `card`, the Profile page's hero for the `hero`) with placeholder text in the real sizes, so the
     card that replaces it doesn't move anything. Until `revealed` it is only the reserved space
     (see loadingGate). `actions` holds the hero's Customise and Edit buttons (your own profile). -->
<script lang="ts">
  import { Skeleton } from '$lib/components/ui/skeleton'
  import { CARD_SURFACE } from '$lib/progress/look'

  let {
    variant = 'card',
    revealed = true,
    actions = false,
  }: { variant?: 'card' | 'hero'; revealed?: boolean; actions?: boolean } = $props()

  const hero = $derived(variant === 'hero')
  const fade = $derived(`transition-opacity duration-200 motion-reduce:transition-none ${revealed ? 'opacity-100' : 'opacity-0'}`)
</script>

<div
  role="status"
  aria-busy="true"
  aria-label="Loading the profile card"
  data-profile-skeleton={variant}
  style="background: {CARD_SURFACE}"
  class="box-border overflow-hidden rounded-popover border border-line-popover shrink-0 {hero ? '' : 'w-[320px] max-w-full shadow-popover'}"
>
  <div class={fade}>
    <Skeleton class="rounded-none {hero ? 'h-[110px] md:h-[200px]' : 'h-[88px]'}" />
    {#if hero}
      <div class="flex flex-col gap-4 px-5 pb-5 md:px-7 md:pb-6">
        <span
          class="relative -mt-12 md:mt-[-68px] flex size-24 md:size-[136px] shrink-0 rounded-full"
          style="box-shadow: 0 0 0 5px {CARD_SURFACE}"><Skeleton class="size-full rounded-full bg-line-3" /></span
        >
        <div class="flex flex-col gap-4 md:flex-row md:items-end">
          <div class="flex flex-col gap-2 min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span class="type-card-title font-bold tracking-title md:text-checkout leading-[0.95]"
                ><Skeleton class="inline-block">Player name</Skeleton></span
              >
              <span style="font-size: 15px"><Skeleton class="inline-block">@playername</Skeleton></span>
            </div>
            <div class="font-display font-bold uppercase tracking-[0.14em]" style="font-size: 20px">
              <Skeleton class="inline-block">Dart title</Skeleton>
            </div>
            <div class="flex flex-wrap items-center gap-2" style="font-size: 13px">
              <Skeleton class="inline-block rounded-full px-3 py-[6px] font-medium">Level 12</Skeleton>
            </div>
            <div style="font-size: 13px"><Skeleton class="inline-block">Member since November 2026</Skeleton></div>
          </div>
          {#if actions}
            <div class="flex flex-wrap gap-2">
              <Skeleton class="h-[46px] w-[109px] rounded-md" /><Skeleton class="h-[46px] w-[154px] rounded-md" />
            </div>
          {/if}
        </div>
      </div>
    {:else}
      <div class="mt-[-34px] flex flex-col px-[22px] pb-[22px]">
        <span class="relative flex size-[68px] rounded-full" style="box-shadow: 0 0 0 4px {CARD_SURFACE}"
          ><Skeleton class="size-full rounded-full bg-line-3" /></span
        >
        <div class="mt-4 flex min-w-0 items-center gap-2">
          <span class="min-w-0 truncate font-semibold leading-[1.1]" style="font-size: 24px"
            ><Skeleton class="inline-block">Player name</Skeleton></span
          >
        </div>
        <div class="mt-[10px] mb-[14px] font-display font-bold uppercase tracking-[0.14em]" style="font-size: 19px">
          <Skeleton class="inline-block">Dart title</Skeleton>
        </div>
        <div class="flex flex-wrap gap-2 font-medium" style="font-size: 13px">
          <Skeleton class="inline-block rounded-full px-3 py-[6px]">Level 12</Skeleton>
        </div>
        <div class="mt-4 grid grid-cols-3 gap-2 border-t border-line-2 pt-[14px]">
          {#each [0, 1, 2] as i (i)}
            <div class="flex flex-col gap-[3px]">
              <span class="uppercase tracking-cta" style="font-size: 11px"><Skeleton class="inline-block">3-dart avg</Skeleton></span>
              <span class="font-display font-bold leading-none" style="font-size: 26px"><Skeleton class="inline-block">00.0</Skeleton></span
              >
            </div>
          {/each}
        </div>
      </div>
    {/if}
  </div>
</div>
