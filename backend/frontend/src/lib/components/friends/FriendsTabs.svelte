<script lang="ts">
  // All · N / Online · N / Requests · N (tablets and desktops; phones show everything stacked).
  // The Friends page's Tabs.Root holds the selected tab and the panel these control.
  import * as Tabs from '$lib/components/ui/tabs/index.js'

  let { counts }: { counts: { all: number; online: number; requests: number } } = $props()
  const tabs = $derived([
    { id: 'all', label: `All · ${counts.all}` },
    { id: 'online', label: `Online · ${counts.online}` },
    { id: 'requests', label: `Requests · ${counts.requests}` },
  ])
</script>

<Tabs.List aria-label="Show" class="hidden md:inline-grid grid-flow-col gap-1 p-1 bg-surface-panel rounded-[10px] border border-line">
  {#each tabs as t (t.id)}
    <Tabs.Trigger variant="pill" value={t.id} class="h-[38px] px-4 text-[14px]">{t.label}</Tabs.Trigger>
  {/each}
</Tabs.List>
