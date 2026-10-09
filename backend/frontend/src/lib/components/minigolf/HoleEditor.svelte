<!--
  The bench's hole editor: the hole as JSON. A valid edit replaces the hole on the bench right
  away; an invalid one shows why and keeps the last good hole. Copy, then paste into the course file.
-->
<script lang="ts">
  import { untrack } from 'svelte'
  import { parseHole } from '$lib/minigolf/bench'
  import type { Hole } from '$shared/minigolf/types'

  let { hole, onChange }: { hole: Hole; onChange: (hole: Hole) => void } = $props()

  let text = $state(untrack(() => JSON.stringify(hole, null, 2)))
  let errors = $state<string[]>([])
  let copied = $state(false)
  /** The hole this text came from, so an edit we passed up doesn't overwrite the text. */
  let shown: Hole = untrack(() => hole)

  // Another hole picked (or reset): show it
  $effect(() => {
    if (hole === shown) return
    shown = hole
    text = JSON.stringify(hole, null, 2)
    errors = []
  })

  let timer: ReturnType<typeof setTimeout> | undefined
  function edited(): void {
    clearTimeout(timer)
    timer = setTimeout(() => {
      const r = parseHole(text)
      if ('errors' in r) {
        errors = r.errors
        return
      }
      errors = []
      shown = r.hole
      onChange(r.hole)
    }, 300)
  }

  async function copy(): Promise<void> {
    await navigator.clipboard.writeText(text)
    copied = true
    setTimeout(() => (copied = false), 2000)
  }
</script>

<section class="flex flex-col gap-2" aria-label="Hole JSON">
  <textarea
    bind:value={text}
    oninput={edited}
    spellcheck="false"
    rows="16"
    class="w-full box-border rounded-[10px] border border-line-2 bg-bg-deep p-3 font-mono text-[12px] leading-[1.45] text-text"
    aria-invalid={errors.length > 0}
    aria-describedby="hole-errors"></textarea>
  <ul id="hole-errors" class="m-0 pl-5 text-[13px] text-danger-text" aria-live="polite">
    {#each errors as e (e)}<li>{e}</li>{/each}
  </ul>
  <button
    type="button"
    class="self-start h-9 rounded-[10px] border border-line-2 bg-surface-2 px-3 text-text text-[14px] font-medium font-[inherit] cursor-pointer hover:bg-surface-hover"
    onclick={() => void copy()}>{copied ? 'Copied' : 'Copy'}</button
  >
</section>
