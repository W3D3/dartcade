<script lang="ts">
  // The hole's checks (holeChecks), live: errors block Publish, warnings are advice. Clicking one
  // selects the element it's about. Above them: why the last edit was refused (a circle or curve
  // that would break the shape), and a notice when the hole's shape was dropped on load.
  import type { Check, ElementRef } from '$shared/minigolf/checks'

  let {
    checks,
    refused = null,
    shapeDropped = false,
    onselect,
  }: { checks: Check[]; refused?: string | null; shapeDropped?: boolean; onselect: (ref: ElementRef) => void } = $props()

  const sentence = (m: string) => m.charAt(0).toUpperCase() + m.slice(1)
  const all = $derived<Check[]>(refused ? [{ level: 'error', message: refused }, ...checks] : checks)
</script>

<section aria-label="Checks" class="flex flex-col gap-2">
  <h2 class="m-0 text-[11px] label-caps text-text-dim">Checks</h2>
  {#if shapeDropped}
    <p role="status" class="m-0 rounded-[8px] border border-warn-line bg-warn-soft px-2 py-1 text-[14px] text-warn">
      This hole's circles were changed elsewhere and are now plain corners.
    </p>
  {/if}
  {#if all.length === 0}
    <p class="m-0 flex items-center gap-2 text-[14px]"><span class="h-2 w-2 rounded-full bg-accent"></span>No problems</p>
  {:else}
    <ul class="m-0 flex list-none flex-col gap-1 p-0" aria-live="polite">
      {#each all as c, i (i)}
        {@const element = c.element}
        <li>
          <button
            type="button"
            disabled={!element}
            onclick={() => element && onselect(element)}
            class="flex w-full items-center gap-2 rounded-[8px] border-0 bg-transparent px-1 py-1 text-left text-[14px] text-text enabled:cursor-pointer enabled:hover:bg-surface-hover"
          >
            <span
              class="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[11px] font-bold {c.level === 'error'
                ? 'bg-live-text text-bg'
                : 'bg-warn text-bg'}"
              aria-label={c.level === 'error' ? 'Error' : 'Warning'}>!</span
            >
            {sentence(c.message)}
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</section>
