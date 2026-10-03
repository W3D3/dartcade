<script lang="ts">
  // The next-game cards' Settings button: opens and closes the settings panel under it.
  import { Settings } from '@lucide/svelte'
  import { Button } from '$lib/components/ui/button/index.js'

  let { open, ontoggle }: { open: boolean; ontoggle: () => void } = $props()
</script>

<Button variant="outline" size="md" pressed={open} class="font-semibold" aria-expanded={open}
  onclick={ontoggle}><Settings size={16} />Settings</Button>
