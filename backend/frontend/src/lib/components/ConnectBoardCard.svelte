<script lang="ts">
  // The side nav's "Connect your board" card (Onboarding-NoBoard), for accounts with no paired
  // board. Its button opens pairing on the Boards page; "Hide for now" hides it on this device.
  // `compact` is the Play page's row version for phones and tablets, which have no side nav.
  import { readFlag, writeFlag } from '$lib/storage'
  import { ChevronRight, Target, X } from '@lucide/svelte'
  import { currentUser } from '$lib/auth'
  import { hasBoards } from '$lib/hasBoards'

  let { compact = false }: { compact?: boolean } = $props()

  const userId = $derived($currentUser?.id ?? null)
  const key = $derived(userId ? `dartcade.connectBoard.hidden.${userId}` : null)
  let dismissedKey = $state<string | null>(null)
  const hidden = $derived(dismissedKey === key || stored(key))

  // Another account can sign in without a page reload: check its boards, not the last one's
  let checkedFor: string | null = null
  $effect(() => {
    if (userId && checkedFor && userId !== checkedFor) {
      hasBoards.set(null)
      void hasBoards.refresh()
    }
    checkedFor = userId ?? checkedFor
  })

  function stored(k: string | null): boolean {
    if (k === null) return true
    return readFlag(k)
  }

  function hide() {
    dismissedKey = key
    if (key) writeFlag(key, true)
  }
</script>

{#if $hasBoards === false && !hidden}
  <aside
    aria-label="Connect a board"
    class="relative box-border p-[14px] rounded-[12px] border border-accent-line-strong flex gap-[10px]
           {compact ? 'flex-row flex-wrap items-center pr-10' : 'flex-col'}
           bg-[linear-gradient(160deg,var(--color-accent-tint)_0%,var(--color-surface-drop)_70%)]"
  >
    <button
      type="button"
      aria-label="Hide for now"
      title="Hide for now"
      onclick={hide}
      class="absolute top-[6px] right-[6px] w-8 h-8 flex items-center justify-center rounded-lg border-0 bg-transparent text-text-dim cursor-pointer hover:text-text hover:bg-surface-hover"
    >
      <X size={14} strokeWidth={2.2} />
    </button>
    <span
      class="w-[38px] h-[38px] shrink-0 box-border flex items-center justify-center rounded-[10px] bg-accent-tint border border-accent-line-strong"
    >
      <Target size={22} strokeWidth={1.8} class="text-accent" />
    </span>
    <span class="flex flex-col gap-[10px] {compact ? 'flex-1 min-w-[200px] gap-1' : ''}">
      <span class="font-display font-bold text-[21px] leading-none uppercase tracking-[0.02em]">Connect your board</span>
      <span class="text-[13px] leading-[1.45] text-ink-2"
        >Every dart scores itself. Play friends on their own boards and unlock ranked.</span
      >
    </span>
    <a
      href="#/settings/boards?pair"
      class="{compact
        ? 'px-4 max-sm:w-full'
        : ''} h-10 flex items-center justify-center gap-[6px] rounded-[10px] bg-accent text-accent-fg text-[14px] font-bold no-underline hover:bg-accent-hover"
    >
      Connect a board<ChevronRight size={15} strokeWidth={2.4} />
    </a>
    {#if !compact}<span class="text-[11px] text-text-dim text-center">Autodarts board · about 2 minutes</span>{/if}
  </aside>
{/if}
