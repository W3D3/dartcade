<!--
  One mission on the Missions list (Missions, Tablet-Missions, Missions-Phone artboards): the author,
  difficulty, name, pills, the steps in words, Your best and Friends' best, and Play. `compact` is the
  phone's card: no steps, the bests on one line and a chevron, the whole card opening the details.
  The ⋯ menu: Duplicate (a new mission from this one), Edit, Delete and who sees it for a mission the
  user may change, Report for someone else's mission that everyone sees.
-->
<script lang="ts">
  import { ChevronRight, Ellipsis, Play } from '@lucide/svelte'
  import { DropdownMenu } from 'bits-ui'
  import Avatar from '$lib/components/Avatar.svelte'
  import { Button, buttonVariants } from '$lib/components/ui/button/index.js'
  import { cn } from '$lib/utils.js'
  import MissionPill from './MissionPill.svelte'
  import { stepTitle } from '$shared/missions/describe'
  import {
    authorLabel,
    authorName,
    bests,
    canReport,
    cardPills,
    DIFFICULTY_LABEL,
    DIFFICULTY_TONE,
    VISIBILITIES,
    VISIBILITY_LABEL,
    type CardAction,
    type MissionCard,
  } from '$lib/missions/view'

  let {
    card,
    viewerId,
    compact = false,
    onplay,
    onopen,
    onaction,
  }: {
    card: MissionCard
    viewerId: string | null
    compact?: boolean
    onplay: () => void
    onopen: () => void
    onaction: (a: CardAction) => void
  } = $props()

  const m = $derived(card.mission)
  const best = $derived(bests(card, viewerId))
  const reportable = $derived(canReport(card, viewerId))
  const ITEM = 'flex h-10 cursor-pointer items-center rounded-sm px-[10px] text-label outline-none data-highlighted:bg-surface-paused'
</script>

{#snippet head()}
  <div class="flex items-center gap-2">
    <Avatar name={authorName(card)} face={null} size={20} tone={card.author?.id === viewerId ? 'accent' : 'default'} />
    <span class="min-w-0 truncate text-small text-text-muted">{authorLabel(card, viewerId)}</span>
    <span class="ml-auto flex items-center gap-1">
      <MissionPill label={DIFFICULTY_LABEL[m.difficulty]} tone={DIFFICULTY_TONE[m.difficulty]} />
      {@render menu()}
    </span>
  </div>
{/snippet}

{#snippet menu()}
  <DropdownMenu.Root>
    <DropdownMenu.Trigger class={cn(buttonVariants({ variant: 'quiet', size: 'icon-sm' }), '-mr-1.5')} aria-label="More for {m.name}"
      ><Ellipsis size={16} /></DropdownMenu.Trigger
    >
    <DropdownMenu.Portal>
      <DropdownMenu.Content
        align="end"
        sideOffset={6}
        class="z-60 flex min-w-[180px] flex-col gap-[2px] rounded-xl border border-line-popover bg-surface-hover p-[6px] [box-shadow:0_18px_44px_rgba(0,0,0,0.55)] outline-none"
      >
        <DropdownMenu.Item class={ITEM} onSelect={() => onaction({ kind: 'duplicate' })}>Duplicate</DropdownMenu.Item>
        {#if card.canEdit}
          <DropdownMenu.Item class={ITEM} onSelect={() => onaction({ kind: 'edit' })}>Edit</DropdownMenu.Item>
          {#if !card.official}
            <DropdownMenu.Separator class="my-1 h-px bg-line-2" />
            <div class="px-[10px] pt-1 text-micro font-semibold uppercase tracking-wide text-text-dim">Who sees it</div>
            {#each VISIBILITIES as v (v)}
              <DropdownMenu.Item class={ITEM} onSelect={() => onaction({ kind: 'visibility', to: v })}
                >{VISIBILITY_LABEL[v]}{#if v === card.visibility}<span class="ml-auto text-accent">✓</span>{/if}</DropdownMenu.Item
              >
            {/each}
            <DropdownMenu.Separator class="my-1 h-px bg-line-2" />
          {/if}
          <DropdownMenu.Item class="{ITEM} text-danger-text" onSelect={() => onaction({ kind: 'delete' })}>Delete</DropdownMenu.Item>
        {:else if reportable}
          <DropdownMenu.Item class={ITEM} onSelect={() => onaction({ kind: 'report' })}>Report</DropdownMenu.Item>
        {/if}
      </DropdownMenu.Content>
    </DropdownMenu.Portal>
  </DropdownMenu.Root>
{/snippet}

{#snippet pills()}
  <div class="flex flex-wrap gap-1.5">
    {#each cardPills(card) as p (p.label)}<MissionPill label={p.label} tone={p.tone} />{/each}
  </div>
{/snippet}

{#snippet hiddenNote()}
  {#if card.hidden}
    <p class="rounded-md border border-danger-line bg-live-soft px-2.5 py-1.5 text-small text-danger-text">
      Hidden by a moderator: {card.hidden.reason}
    </p>
  {/if}
{/snippet}

{#if compact}
  <article class="relative flex flex-col gap-2 rounded-card border border-line bg-surface-panel p-4" aria-label={m.name}>
    {@render head()}
    <button type="button" class="text-left after:absolute after:inset-0 after:content-['']" onclick={onopen}>
      <h3 class="font-display text-player-name font-bold uppercase leading-none">{m.name}</h3>
    </button>
    {@render pills()}
    {@render hiddenNote()}
    <div class="flex items-center gap-2 text-small text-text-muted">
      <span>Your best <b class="font-display text-body-lg text-text">{best.tried ?? best.yours}</b></span>
      <span class="ml-auto">Friends’ best <b class="font-display text-body-lg text-text">{best.friends}</b></span>
      <ChevronRight size={16} class="text-text-dim" aria-hidden="true" />
    </div>
  </article>
{:else}
  <article class="flex flex-col gap-3 rounded-card border border-line bg-surface-panel p-[18px]" aria-label={m.name}>
    {@render head()}
    <h3 class="type-section-title uppercase leading-none">
      <button type="button" class="cursor-pointer text-left hover:text-accent" onclick={onopen}>{m.name}</button>
    </h3>
    {@render pills()}
    {@render hiddenNote()}
    <ol class="flex flex-col gap-1.5">
      {#each m.steps.map(stepTitle) as line, i (i)}
        <li class="flex items-center gap-2 text-small text-ink-2">
          <span
            class="flex size-5 flex-none items-center justify-center rounded-chip bg-surface-paused font-display text-caption font-bold text-accent"
            >{i + 1}</span
          >{line}
        </li>
      {/each}
    </ol>
    <div class="mt-auto flex items-center gap-2.5 border-t border-surface-paused pt-2.5">
      <span class="flex flex-1 flex-col"
        ><span class="text-caption text-text-muted">Your best</span><span class="font-display text-lead font-bold">{best.yours}</span
        >{#if best.tried}<span class="text-caption text-text-muted">{best.tried}</span>{/if}</span
      >
      <span class="flex flex-1 flex-col"
        ><span class="text-caption text-text-muted">Friends’ best</span><span class="font-display text-lead font-bold">{best.friends}</span
        ></span
      >
      <Button variant="accent" size="sm" onclick={onplay} aria-label="Play {m.name}"><Play size={14} />Play</Button>
    </div>
  </article>
{/if}
