<script lang="ts">
  // Customise your card (Profile-Customise and Mobile-Profile-Customise boards):
  // `#/profile/customise/:tab`. A draft of your look and your picture's two layers, shown live on
  // your card and in a lobby row, and saved together (only what changed) or dropped on Cancel.
  // Switching tabs keeps the draft: it's one route, so the page stays mounted. Locked options show
  // what unlocks them and can't be picked. Behind progression.enabled, like Profile.
  import { deviceStore } from '$lib/storage'
  import type { Snippet } from 'svelte'
  import { PartyPopper, Trophy, Volume2, VolumeX } from '@lucide/svelte'
  import { push } from 'svelte-spa-router'
  import Layout from '$lib/components/Layout.svelte'
  import PageLoading from '$lib/components/PageLoading.svelte'
  import Avatar from '$lib/components/Avatar.svelte'
  import ErrorText from '$lib/components/ErrorText.svelte'
  import FinishPicture from '$lib/components/FinishPicture.svelte'
  import SegmentedControl from '$lib/components/SegmentedControl.svelte'
  import CardFrame from '$lib/components/progress/CardFrame.svelte'
  import Celebration from '$lib/components/progress/Celebration.svelte'
  import CustomiseTile from '$lib/components/progress/CustomiseTile.svelte'
  import ProfileCard from '$lib/components/progress/ProfileCard.svelte'
  import { Breadcrumb } from '$lib/components/ui/breadcrumb/index.js'
  import { Button } from '$lib/components/ui/button/index.js'
  import { Switch } from '$lib/components/ui/switch/index.js'
  import { currentUser } from '$lib/auth'
  import { flag } from '$lib/flags'
  import { loadSettings } from '$lib/gameSettings'
  import { createSoundPacks } from '$lib/soundPacks'
  import {
    TABS,
    TAB_KIND,
    TAB_META,
    equipChanges,
    gridItems,
    loadHideLocked,
    pictureChanged,
    saveHideLocked,
    tabOf,
    unlockedCount,
    type Layers,
  } from '$lib/progress/customise'
  import { equip } from '$lib/progress/equip'
  import { accentOf, bannerClass, bannerStyle, cardColors, colorsClass, nameClass, titleName } from '$lib/progress/look'
  import { pictureUnlock, shownFinishes, splitBasics, wearPicture } from '$lib/progress/pictures'
  import { profileOf, refreshProfile, statusOf } from '$lib/progress/profiles'
  import { progress } from '$lib/progress/store'
  import { AVATAR_FINISHES, DEFAULT_AVATAR_FINISH } from '$shared/avatarFinishes.js'
  import { PERKS, listed, unlockText, type Equipped, type PerkKind } from '$shared/progression.js'

  let { params = {} }: { params?: { tab?: string } } = $props()

  const progression = flag('progression.enabled')
  const tab = $derived(tabOf(params.tab))
  const meta = $derived(TAB_META[tab])
  const perkKind = $derived<PerkKind>(tab === 'picture' ? 'picture' : TAB_KIND[tab])
  const userId = $derived($currentUser?.id ?? null)
  let profile = $derived(userId ? profileOf(userId) : null)
  let status = $derived(userId ? statusOf(userId) : null)
  $effect(() => {
    if (userId) refreshProfile(userId)
  })

  // What you wear now, and the draft: taken from it once both are known
  const wornAvatar = $derived($currentUser?.avatar ?? null)
  const wornLayers = $derived<Layers>(
    wornAvatar?.kind === 'preset' ? { foreground: wornAvatar.foreground, background: wornAvatar.background } : null,
  )
  let look = $state<Equipped | null>(null)
  let layers = $state<Layers>(null)
  $effect(() => {
    if (look || !$progress || !$currentUser) return
    look = { ...$progress.perks.equipped }
    layers = wornLayers
  })
  const avatar = $derived(layers ? { kind: 'preset' as const, ...layers } : ($profile?.avatar ?? null))
  const colors = $derived(cardColors(look?.colors ?? ''))
  const accent = $derived(accentOf(colors))

  let hideLocked = $state(loadHideLocked())
  let layer = $state<'foreground' | 'background'>('foreground')
  let busy = $state(false)
  let error = $state('')

  type Item = { id: string; name: string; open: boolean; unlock: string }
  const finishes = $derived<Item[]>(
    shownFinishes([...($currentUser?.pictures ?? []), ...(wornLayers ? [wornLayers.foreground, wornLayers.background] : [])]).map(f => ({
      id: f.id,
      name: f.name,
      open: ($currentUser?.pictures ?? []).includes(f.id),
      unlock: pictureUnlock(f.id),
    })),
  )
  const rows = $derived(splitBasics(finishes))
  // What you hold or wear stays listed, even one nothing unlocks yet
  const held = $derived($progress ? [...$progress.perks.unlocked, ...Object.values($progress.perks.equipped)] : [])
  const perksOf = (kind: PerkKind): Item[] =>
    PERKS.filter(p => p.kind === kind && listed(p, held)).map(p => ({
      id: p.id,
      name: p.name,
      open: ($progress?.perks.unlocked ?? []).includes(p.id),
      unlock: unlockText(p.unlock),
    }))
  const finishName = (id: string | undefined) => AVATAR_FINISHES.find(f => f.id === id)?.name ?? '—'

  function pickLayer(which: 'foreground' | 'background', id: string) {
    layers = { foreground: DEFAULT_AVATAR_FINISH, background: DEFAULT_AVATAR_FINISH, ...layers, [which]: id }
  }

  // A sound pack plays its sample and a celebration plays over the card when picked (at this
  // device's effects volume; `run` replays it)
  const packs = createSoundPacks(() => loadSettings(deviceStore()).effectsVolume)
  let party = $state<{ id: string; run: number } | null>(null)
  function pickPerk(kind: PerkKind, id: string) {
    if (!look) return
    look = { ...look, [kind]: id }
    if (kind === 'sound') packs.preview(id)
    if (kind === 'celebration') party = { id, run: (party?.run ?? 0) + 1 }
  }

  function toggleHide() {
    hideLocked = !hideLocked
    saveHideLocked(hideLocked)
  }

  async function save() {
    if (!look || !$progress || busy) return
    busy = true
    error = ''
    const changes = equipChanges($progress.perks.equipped, look)
    let err = Object.keys(changes).length ? await equip(changes) : null
    if (!err && layers && pictureChanged(wornLayers, layers)) err = await wearPicture(layers.foreground, layers.background)
    busy = false
    if (err) error = err
    else void push('/profile')
  }

  const caps = 'font-mono text-[11px] tracking-[0.08em] uppercase text-text-dim'
</script>

{#snippet hideSwitch(cls: string)}
  <label class="{cls} items-center gap-2 text-[13px] text-ink-2 whitespace-nowrap cursor-pointer">
    <Switch size="sm" checked={hideLocked} onCheckedChange={toggleHide} />Hide locked
  </label>
{/snippet}

<!-- A grid's heading: its name, subtitle and count; on a phone the Hide locked switch too -->
{#snippet gridHead(title: string, sub: string, items: Item[])}
  <div class="flex items-baseline gap-[10px] lg:gap-3">
    <h2 class="m-0 text-[16px] lg:text-[17px] font-semibold">{title}</h2>
    {#if sub}<span class="hidden lg:inline text-[13px] text-text-muted">{sub}</span>{/if}
    <span class="lg:ml-auto text-[12px] text-text-dim">{unlockedCount(items)}</span>
    {@render hideSwitch('ml-auto lg:hidden inline-flex')}
  </div>
{/snippet}

{#snippet grid(
  items: Item[],
  cols: string,
  selected: string | undefined,
  pick: (id: string) => void,
  preview: Snippet<[Item]>,
  layout: 'tile' | 'row' | 'wide' = 'tile',
)}
  <ul class="m-0 p-0 list-none grid gap-2 {cols}">
    {#each gridItems(items, hideLocked) as it (it.id)}
      <li class="min-w-0">
        <CustomiseTile
          name={it.name}
          open={it.open}
          selected={selected === it.id}
          unlock={it.unlock}
          row={layout === 'row'}
          wide={layout === 'wide'}
          onpick={() => pick(it.id)}>{@render preview(it)}</CustomiseTile
        >
      </li>
    {/each}
  </ul>
{/snippet}

<!-- The basics, compact above the finishes: never locked, so Hide locked leaves them be -->
{#snippet basicsRow(selected: string | undefined, pick: (id: string) => void, preview: Snippet<[Item]>)}
  <div class="flex flex-wrap items-center gap-2 px-3 py-[10px] rounded-[12px] bg-surface-1 border border-surface-paused">
    <span class="min-w-[52px] mr-1 text-[12px] font-semibold text-text-muted">Basics</span>
    {#each gridItems(rows.basics, hideLocked) as it (it.id)}
      <CustomiseTile name={it.name} open={it.open} selected={selected === it.id} unlock={it.unlock} compact onpick={() => pick(it.id)}
        >{@render preview(it)}</CustomiseTile
      >
    {/each}
  </div>
{/snippet}
{#snippet basicPreview(it: Item)}
  <FinishPicture foreground={it.id} class="size-10" />
{/snippet}
{#snippet basicDiscPreview(it: Item)}
  <FinishPicture background={it.id} class="size-10" />
{/snippet}

{#snippet finishPreview(it: Item)}
  <FinishPicture foreground={it.id} class="size-[60px] lg:size-16" />
{/snippet}
{#snippet discPreview(it: Item)}
  <FinishPicture background={it.id} class="size-[60px] lg:size-16" />
{/snippet}
{#snippet framePreview(it: Item)}
  {#if it.id === 'frame.none'}
    <span class="m-1 flex rounded-full p-[5px] shadow-[inset_0_0_0_1px_var(--color-line-chip)]"
      ><Avatar name={$profile?.name ?? ''} {avatar} {userId} size={48} /></span
    >
  {:else}
    <span class="relative m-[9px] flex rounded-full"
      ><Avatar name={$profile?.name ?? ''} {avatar} {userId} size={48} /><CardFrame frame={it.id} /></span
    >
  {/if}
{/snippet}
{#snippet bannerPreview(it: Item)}
  <span class="block w-full h-[58px] rounded-[8px] {bannerClass(it.id)}" style={bannerStyle(it.id, colors)}></span>
{/snippet}
{#snippet coloursPreview(it: Item)}
  {@const a = accentOf(cardColors(it.id))}
  <span
    class="relative overflow-hidden flex items-center gap-2 w-full box-border h-[46px] px-[10px] rounded-[8px] {colorsClass(it.id)}"
    style="background: color-mix(in srgb, {a} 12%, #181a16); border: 1px solid color-mix(in srgb, {a} 30%, #181a16)"
  >
    <span class="size-3 shrink-0 rounded-full" style="background: {a}"></span>
    <span class="truncate text-[15px] font-semibold" style="color: {a}">{$profile?.name ?? 'Aa'}</span>
  </span>
{/snippet}
{#snippet namePreview(it: Item)}
  <span class="flex items-center w-full box-border h-[46px] px-[10px] rounded-[8px] bg-surface-inset">
    <span class="truncate text-[17px] font-semibold {nameClass(it.id)}" style="color: {accent}">{$profile?.name ?? 'Aa'}</span>
  </span>
{/snippet}
{#snippet titlePreview(it: Item)}
  <span class="truncate font-display font-bold text-[16px] uppercase tracking-[0.12em]">{it.name}</span>
{/snippet}
{#snippet soundPreview(it: Item)}
  {@const Icon = it.id === 'sound.none' ? VolumeX : Volume2}
  <span class="size-12 rounded-full border border-line-2 bg-surface-inset flex items-center justify-center text-accent"
    ><Icon size={22} aria-hidden="true" /></span
  >
{/snippet}
{#snippet celebrationPreview(it: Item)}
  {@const Icon = it.id === 'celebration.standard' ? Trophy : PartyPopper}
  <span class="size-12 rounded-full border border-line-2 bg-surface-inset flex items-center justify-center text-accent"
    ><Icon size={22} aria-hidden="true" /></span
  >
{/snippet}

{#snippet saveButton(cls: string)}
  <Button variant="accent" size="sm" class={cls} disabled={busy || !look} onclick={() => void save()}>Save</Button>
{/snippet}
{#snippet phoneSave()}{@render saveButton('h-[38px] px-4 text-[14px] font-semibold')}{/snippet}

<Layout title="Customise" headerAction={phoneSave}>
  <main
    class="flex flex-grow min-h-0 flex-col gap-4 md:gap-[22px] box-border min-w-0 overflow-y-auto px-4 pt-3 pb-6 md:px-[30px] md:py-7 xl:px-11 xl:pt-8 xl:pb-10"
  >
    <Breadcrumb items={[{ label: 'Profile', href: '#/profile' }, { label: 'Customise' }]} />
    <div class="hidden md:flex items-center gap-4 -mt-3">
      <h1 class="m-0 font-display font-bold text-[40px] leading-none uppercase tracking-[0.02em]">Customise</h1>
      <div class="ml-auto flex gap-[10px]">
        <Button variant="outline" size="md" href="#/profile" class="px-5 text-[15px] font-semibold">Cancel</Button>
        {@render saveButton('h-11 px-5 font-semibold')}
      </div>
    </div>
    {#if error}<ErrorText>{error}</ErrorText>{/if}

    {#if !$progression}
      <p class="m-0 text-[15px] text-text-muted">Profiles aren't on for your account yet.</p>
    {:else if !look || !$profile}
      <PageLoading />
    {:else}
      <div class="flex items-center gap-4 min-w-0">
        <nav aria-label="Customise" class="flex gap-1 lg:gap-[6px] min-w-0 overflow-x-auto [scrollbar-width:none]">
          {#each TABS as t (t)}
            <a
              href="#/profile/customise/{t}"
              aria-current={t === tab ? 'page' : undefined}
              class="shrink-0 rounded-full border px-3 py-[7px] text-[13px] lg:px-4 lg:py-[9px] lg:text-[14px] no-underline {t === tab
                ? 'border-line-chip bg-surface-paused text-text font-semibold'
                : 'border-transparent text-text-muted font-medium hover:text-text'}">{TAB_META[t].label}</a
            >
          {/each}
        </nav>
        {@render hideSwitch('ml-auto hidden lg:inline-flex')}
      </div>

      <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-7">
        <aside class="flex flex-col gap-4 lg:w-[360px] lg:shrink-0">
          <section
            aria-label="Your card"
            class="flex flex-col items-center gap-4 lg:rounded-[18px] lg:border lg:border-line-2 lg:bg-surface-panel lg:px-6 lg:pt-6 lg:pb-5"
          >
            <span class="hidden lg:block self-start {caps}">Your card</span>
            <div class="relative w-fit max-w-full">
              <ProfileCard profile={$profile} {look} avatar={avatar ?? undefined} status={status ? $status : null} />
              {#if party}
                {#key party.run}
                  <Celebration id={party.id} {colors} class="absolute -inset-8 w-[calc(100%+4rem)] h-[calc(100%+4rem)]" />
                {/key}
              {/if}
            </div>
            {#if tab === 'picture'}
              <div class="w-full grid grid-cols-2 gap-2">
                {#each [['Foreground', layers?.foreground], ['Background', layers?.background]] as [label, id] (label)}
                  <div class="rounded-[10px] bg-surface-row px-3 py-[10px]">
                    <div class="{caps} text-[10.5px]">{label}</div>
                    <div class="mt-[3px] text-[15px] font-semibold">
                      {layers ? finishName(id) : wornAvatar?.kind === 'upload' ? 'Your photo' : 'Initials'}
                    </div>
                  </div>
                {/each}
              </div>
            {/if}
            <p class="hidden lg:block m-0 text-center text-[13px] leading-[1.45] text-text-muted">{meta.hint}</p>
          </section>
          <section
            aria-label="How others see it"
            class="hidden lg:flex flex-col gap-3 rounded-[18px] border border-line-2 bg-surface-panel px-[18px] py-4"
          >
            <span class={caps}>How others see it</span>
            <div class="flex items-center gap-[10px] rounded-[10px] bg-surface-row px-[10px] py-1">
              <span class="relative m-[9px] flex shrink-0 rounded-full"
                ><Avatar name={$profile.name} {avatar} {userId} size={30} /><CardFrame frame={look.frame} /></span
              >
              <span class="flex flex-col flex-1 min-w-0">
                <span class="truncate text-[14px] font-semibold {nameClass(look.name)}" style="color: {accent}">{$profile.name}</span>
                <span class="truncate text-[11px] uppercase tracking-[0.08em] text-text-muted">{titleName(look)}</span>
              </span>
              <span class="text-[12px] text-text-muted">Lobby</span>
            </div>
          </section>
        </aside>

        <div class="flex flex-col gap-4 lg:gap-7 flex-1 min-w-0">
          {#if tab === 'picture'}
            <SegmentedControl
              class="lg:hidden bg-surface-panel border border-line-2"
              options={[
                { value: 'foreground', label: 'Foreground' },
                { value: 'background', label: 'Background' },
              ]}
              bind:value={layer}
            />
            <section class="{layer === 'foreground' ? 'flex' : 'hidden lg:flex'} flex-col gap-3">
              {@render gridHead('Foreground', 'the mark in the middle', finishes)}
              {@render basicsRow(layers?.foreground, id => pickLayer('foreground', id), basicPreview)}
              {@render grid(
                rows.finishes,
                'grid-cols-4 sm:grid-cols-5 xl:grid-cols-7',
                layers?.foreground,
                id => pickLayer('foreground', id),
                finishPreview,
              )}
            </section>
            <section class="{layer === 'background' ? 'flex' : 'hidden lg:flex'} flex-col gap-3">
              {@render gridHead('Background', 'the disc behind it', finishes)}
              {@render basicsRow(layers?.background, id => pickLayer('background', id), basicDiscPreview)}
              {@render grid(
                rows.finishes,
                'grid-cols-4 sm:grid-cols-5 xl:grid-cols-7',
                layers?.background,
                id => pickLayer('background', id),
                discPreview,
              )}
            </section>
          {:else}
            {@const kind = perkKind}
            {@const items = perksOf(kind)}
            <section class="flex flex-col gap-3">
              {@render gridHead(meta.label, meta.sub, items)}
              {#if tab === 'frame'}
                {@render grid(items, 'grid-cols-3 sm:grid-cols-6', look.frame, id => pickPerk(kind, id), framePreview)}
              {:else if tab === 'banner'}
                {@render grid(items, 'grid-cols-2 sm:grid-cols-4', look.banner, id => pickPerk(kind, id), bannerPreview, 'wide')}
              {:else if tab === 'colours'}
                {@render grid(items, 'grid-cols-2 sm:grid-cols-4', look.colors, id => pickPerk(kind, id), coloursPreview, 'wide')}
              {:else if tab === 'title'}
                {@render grid(items, 'grid-cols-1 sm:grid-cols-2', look.title, id => pickPerk(kind, id), titlePreview, 'row')}
              {:else if tab === 'sounds'}
                {@render grid(items, 'grid-cols-3 sm:grid-cols-5', look.sound, id => pickPerk(kind, id), soundPreview)}
              {:else}
                {@render grid(items, 'grid-cols-3 sm:grid-cols-5', look.celebration, id => pickPerk(kind, id), celebrationPreview)}
              {/if}
            </section>
            {#if tab === 'colours'}
              {@const names = perksOf('name')}
              <!-- The Gold name is drawn over your colour, whichever it is; Plain undoes it -->
              <section class="flex flex-col gap-3">
                {@render gridHead('Name style', 'over your colour', names)}
                {@render grid(names, 'grid-cols-2 sm:grid-cols-4', look.name, id => pickPerk('name', id), namePreview, 'wide')}
              </section>
            {/if}
          {/if}
        </div>
      </div>
    {/if}
  </main>
</Layout>
