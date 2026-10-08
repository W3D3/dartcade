<script lang="ts">
  // Shown when a lazily-loaded route's chunk fails to download (offline, or a stale tab after a
  // deploy whose hashed chunk is gone) — see App.svelte's `wrap({ asyncComponent })` for
  // `/history/:id`, which falls back to this on a rejected import. Imported statically there (not
  // itself lazy) so its own load can't fail the same way.
  import Layout from '$lib/components/Layout.svelte'
  import ErrorText from '$lib/components/ErrorText.svelte'
  import { Button } from '$lib/components/ui/button/index.js'
</script>

<Layout title="Match details">
  <div class="flex flex-col items-start gap-3 p-8">
    <ErrorText>Couldn't load this page.</ErrorText>
    <Button variant="outline" size="md" onclick={() => location.reload()}>Reload</Button>
  </div>
</Layout>
