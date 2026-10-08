<script lang="ts">
  // Placeholder for a lazily-loaded route (App.svelte's `wrap({ asyncComponent, loadingComponent
  // })`) while its chunk downloads — the nav stays up instead of a blank page, same loading line
  // GameDetails shows for its own data fetch.
  import Layout from '$lib/components/Layout.svelte'
</script>

<Layout title="Match details">
  <p class="m-0 p-8 text-[15px] text-text-muted">Loading the game…</p>
</Layout>
