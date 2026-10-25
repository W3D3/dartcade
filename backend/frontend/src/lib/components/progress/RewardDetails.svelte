<script lang="ts">
  // One reward of the rewards track opened (Rewards board's details): every item with its preview,
  // kind and name; an unlocked one is applied at once (Applied when worn), a locked one says what
  // unlocks it. Apply all wears every unlocked item; Customise is a link away.
  import { Check, Lock, X } from '@lucide/svelte'
  import { Dialog } from 'bits-ui'
  import { Modal } from '$lib/components/ui/modal'
  import { Button } from '$lib/components/ui/button'
  import ErrorText from '$lib/components/ErrorText.svelte'
  import PerkPreview from './PerkPreview.svelte'
  import { currentUser } from '$lib/auth'
  import { equip } from '$lib/progress/equip'
  import { KIND_LABEL } from '$lib/progress/look'
  import { wearPicture } from '$lib/progress/pictures'
  import { progress } from '$lib/progress/store'
  import { applyAllPlan, isWorn } from '$lib/progress/track'
  import { DEFAULT_EQUIPPED, unlockText, type Perk } from '$shared/progression.js'

  let {
    eyebrow,
    title,
    status,
    got,
    perks,
    onclose,
  }: {
    /** 'Level 10', 'Off the track' */
    eyebrow: string
    title: string
    /** 'Unlocked', 'Unlocks at level 12 · 2 levels to go' */
    status: string
    got: boolean
    perks: readonly Perk[]
    onclose: () => void
  } = $props()

  const colors = $derived($progress?.perks.equipped.colors ?? 'colors.dartcade')
  const unlocked = $derived($progress?.perks.unlocked ?? [])
  const worn = $derived({ equipped: $progress?.perks.equipped ?? DEFAULT_EQUIPPED, avatar: $currentUser?.avatar })
  const plan = $derived(applyAllPlan(perks, unlocked, worn))

  let busy = $state(false)
  let error = $state<string | null>(null)

  async function run(write: () => Promise<string | null>) {
    busy = true
    error = await write()
    busy = false
  }

  const applyOne = (p: Perk) =>
    run(() => {
      if (p.kind !== 'picture') return equip({ [p.kind]: p.id })
      const finish = p.id.slice('picture.'.length)
      return wearPicture(finish, finish)
    })

  const applyAll = () =>
    run(async () => {
      const { equip: changes, picture } = plan
      if (Object.keys(changes).length > 0) {
        const e = await equip(changes)
        if (e) return e
      }
      return picture ? wearPicture(picture, picture) : null
    })
</script>

<Modal {onclose} showClose={false} dismissOnBackdrop widthClass="max-w-[640px]">
  <div class="flex items-start gap-4">
    <div class="flex-1 min-w-0 flex flex-col gap-[6px]">
      <span class="text-[12px] label-caps {got ? 'text-accent' : 'text-text-dim'}">{eyebrow}</span>
      <Dialog.Title class="m-0 font-display font-bold text-[30px] md:text-[34px] leading-[1.05] uppercase tracking-[0.03em]"
        >{title}</Dialog.Title
      >
      <span class="flex items-center gap-[6px] text-[13px] {got ? 'text-accent' : 'text-text-muted'}">
        {#if got}<Check size={14} strokeWidth={3} aria-hidden="true" />{:else}<Lock size={13} aria-hidden="true" />{/if}
        {status}
      </span>
    </div>
    <button
      type="button"
      onclick={onclose}
      aria-label="Close"
      class="size-9 shrink-0 flex items-center justify-center rounded-full border border-line-2 bg-surface-2 text-text hover:bg-surface-paused"
    >
      <X size={18} aria-hidden="true" />
    </button>
  </div>

  <ul class="m-0 p-0 list-none flex flex-col gap-2">
    {#each perks as p (p.id)}
      {@const has = unlocked.includes(p.id)}
      {@const on = has && isWorn(p, worn)}
      <li class="flex items-center gap-3 md:gap-4 rounded-[12px] border border-line-2 bg-bg/40 px-3 py-3 md:px-[14px]">
        <div class="w-[84px] md:w-[120px] h-[60px] shrink-0 rounded-[8px] bg-bg flex items-center justify-center overflow-hidden">
          <!-- Zoomed 1.5×: the cap is the box's width over 1.5, so a long title truncates instead of spilling out -->
          <div class="pv flex items-center justify-center max-w-[52px] md:max-w-[76px] {has ? '' : 'locked'}">
            <PerkPreview perk={p} {colors} />
          </div>
        </div>
        <div class="flex-1 min-w-0 flex flex-col gap-[2px]">
          <span class="text-[15px] font-semibold truncate">{p.name}</span>
          <span class="text-[12px] uppercase tracking-[0.06em] text-text-muted">{KIND_LABEL[p.kind].one}</span>
        </div>
        {#if on}
          <span
            class="h-9 shrink-0 flex items-center gap-[6px] rounded-full border border-[#6a7d34] bg-accent/10 px-[14px] text-[13px] font-semibold text-accent"
            ><Check size={14} strokeWidth={3} aria-hidden="true" />Applied</span
          >
        {:else if has}
          <Button variant="accent" size="sm" class="rounded-full text-[13px]" disabled={busy} onclick={() => applyOne(p)}
            >Apply<span class="sr-only"> {p.name}</span></Button
          >
        {:else}
          <span
            class="min-h-9 max-w-[45%] shrink-0 flex items-center gap-[6px] rounded-full border border-line-2 px-[14px] py-1 text-[13px] font-semibold text-text-dim"
            ><Lock size={13} class="shrink-0" aria-hidden="true" />{unlockText(p.unlock)}</span
          >
        {/if}
      </li>
    {/each}
  </ul>

  {#if error}<ErrorText>{error}</ErrorText>{/if}

  <div class="flex flex-wrap items-center gap-3">
    <a href="#/profile/customise" class="text-[13px] text-text-muted hover:text-text">Open in Profile · Customise</a>
    <span class="flex-1"></span>
    <Button variant="accent" size="sm" class="rounded-full px-5" disabled={busy || plan.empty} onclick={applyAll}>Apply all</Button>
    <Button variant="outline" size="sm" class="rounded-full" onclick={onclose}>Close</Button>
  </div>
</Modal>

<style>
  .pv {
    zoom: 1.5;
  }
  .pv.locked {
    filter: grayscale(1);
    opacity: 0.45;
  }
</style>
