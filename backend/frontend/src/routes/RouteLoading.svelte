<script lang="ts">
  // Placeholder for a lazily-loaded route (App.svelte's `wrap({ asyncComponent, loadingComponent
  // })`) while its chunk downloads — the nav stays up instead of a blank page, same indicator
  // GameDetails shows for its own data fetch.
  import Layout from '$lib/components/Layout.svelte'
  import LoadingBlock from '$lib/components/LoadingBlock.svelte'
</script>

<Layout title="Match details">
  <LoadingBlock label="Loading the game" class="p-8" />
</Layout>
