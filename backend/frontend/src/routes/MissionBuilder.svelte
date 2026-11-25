<!-- The mission builder's place (`#/play/missions/new`, `#/play/missions/:id/edit`), Missions part 3. Until then it says so. Behind missions.enabled. -->
<script lang="ts">
  import { push } from 'svelte-spa-router'
  import Layout from '$lib/components/Layout.svelte'
  import PageMain from '$lib/components/PageMain.svelte'
  import PageTitle from '$lib/components/PageTitle.svelte'
  import { Button } from '$lib/components/ui/button/index.js'
  import { flag, flagsLoaded } from '$lib/flags'
  import { hrefs } from '$lib/routes'

  const enabled = flag('missions.enabled')
  $effect(() => {
    if ($flagsLoaded && !$enabled) void push('/')
  })
</script>

<Layout title="New mission">
  <PageMain>
    <PageTitle
      title="Mission builder"
      sub="Build a mission from steps."
      trail={[{ label: 'Missions', href: hrefs.missions() }, { label: 'Builder' }]}
    />
    <div class="flex flex-col items-start gap-3 rounded-card border border-dashed border-line-dashed p-6">
      <p class="text-body text-text-muted">The mission builder is coming soon. Until then, play the missions on the list.</p>
      <Button variant="outline" href={hrefs.missions()}>Back to missions</Button>
    </div>
  </PageMain>
</Layout>
