<script lang="ts">
  // All · N / Online · N / Requests · N (tablets and desktops; phones show everything stacked).
  // Tabs pattern: each tab controls `panelId` (labelled by the selected tab, friendsTabId), only the
  // selected tab is in the tab order, Left/Right/Home/End move between tabs.
  import { tabAfterKey, friendsTabId as tabId, type FriendsTab } from '$lib/friends/view'

  let { tab = $bindable(), counts, panelId }: {
    tab: FriendsTab; counts: { all: number; online: number; requests: number }; panelId: string
  } = $props()
  const tabs = $derived([
    { id: 'all' as const, label: `All · ${counts.all}` },
    { id: 'online' as const, label: `Online · ${counts.online}` },
    { id: 'requests' as const, label: `Requests · ${counts.requests}` },
  ])

  function onkeydown(e: KeyboardEvent) {
    const next = tabAfterKey(e.key, tab)
    if (!next) return
    e.preventDefault()
    tab = next
    document.getElementById(tabId(next))?.focus()
  }
</script>

<div role="tablist" aria-label="Show" class="hidden md:inline-grid grid-flow-col gap-1 p-1 bg-surface-panel rounded-[10px] border border-line">
  {#each tabs as t (t.id)}
    <button type="button" role="tab" id={tabId(t.id)} aria-selected={tab === t.id} aria-controls={panelId}
      tabindex={tab === t.id ? 0 : -1} {onkeydown} onclick={() => tab = t.id}
      class="h-[38px] px-4 rounded-[7px] border-0 cursor-pointer text-[14px] font-[inherit]
             {tab === t.id ? 'bg-line text-text font-semibold' : 'bg-transparent text-ink-2 hover:text-text'}">{t.label}</button>
  {/each}
</div>
