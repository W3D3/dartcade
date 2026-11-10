<script lang="ts">
  // What an import did: the new profile, how many effects came through and what the file had that
  // wasn't used or was changed to fit.
  import { Button } from '$lib/components/ui/button/index.js'
  import { Modal } from '$lib/components/ui/modal/index.js'
  import { importSummary } from '$lib/lights/view'

  let { result, onclose }: { result: { name: string; imported: number; ignored: string[]; adjusted: string[] }; onclose: () => void } =
    $props()
</script>

<Modal {onclose} title="Profile imported" subtitle={result.name} widthClass="max-w-lg">
  <p class="text-sm font-semibold" role="status">{importSummary(result)}</p>
  {#each [{ title: 'Ignored', items: result.ignored }, { title: 'Changed to fit', items: result.adjusted }] as group (group.title)}
    {#if group.items.length}
      <section class="flex flex-col gap-1">
        <h3 class="text-xs font-semibold">{group.title}</h3>
        <ul class="pl-5 text-xs text-text-muted flex flex-col gap-0.5 max-h-[30vh] overflow-y-auto">
          {#each group.items as item, i (i)}<li>{item}</li>{/each}
        </ul>
      </section>
    {/if}
  {/each}
  <p class="text-xs text-text-dim">The new profile is in use on this board. Nothing you had was overwritten.</p>
  {#snippet footer()}
    <Button variant="accent" onclick={onclose}>Done</Button>
  {/snippet}
</Modal>
