<script lang="ts">
  // The create form's Preview card: the tournament as Browse will list it, what keeps it from
  // saving, and the save buttons. Sticky beside the form on a desktop, below it on a phone.
  import { Info } from '@lucide/svelte'
  import Avatar from '$lib/components/Avatar.svelte'
  import { Button } from '$lib/components/ui/button/index.js'
  import type { Preview } from '$lib/tournaments/create'

  let {
    preview,
    owner,
    problems,
    errors,
    primary,
    secondary,
    footnote,
    busy,
    onsave,
  }: {
    preview: Preview
    owner: string
    /** Each in a sentence; saving is off while there are any. */
    problems: string[]
    /** Why the last save failed (the server's answer). */
    errors: string[]
    primary: string
    /** Saves without publishing; none once it is published. */
    secondary: string | null
    footnote: string | null
    busy: boolean
    onsave: (publish: boolean) => void
  } = $props()
</script>

<section aria-label="Preview" class="card flex flex-col gap-3 p-[18px] lg:sticky lg:top-6">
  <span class="type-eyebrow font-semibold text-text-dim">Preview</span>
  <div class="flex flex-col gap-2.5 rounded-card border border-line bg-surface-1 p-4">
    <div class="flex items-center gap-2">
      <Avatar name={owner} face={null} tone="accent" size={20} />
      <span class="text-caption text-text-muted">by {owner} · {preview.access}</span>
    </div>
    <span class="wrap-break-word type-section-title leading-none">{preview.name}</span>
    <div class="flex flex-wrap gap-1.5">
      {#each preview.pills as pill (pill)}
        <span class="inline-flex h-[22px] items-center rounded-full bg-surface-chip px-2 text-caption font-bold text-ink-2">{pill}</span>
      {/each}
    </div>
    <span class="text-label text-text-muted">{preview.when} · {preview.size}</span>
  </div>
  <p class="text-caption text-text-dim">{preview.help}</p>

  {#if problems.length > 0 || errors.length > 0}
    <ul class="flex flex-col gap-1 p-0 text-caption text-danger-text">
      {#each [...problems, ...errors] as p, i (i)}<li>{p}</li>{/each}
    </ul>
  {/if}

  <div class="flex flex-col gap-2">
    <Button variant="accent" size="lg" disabled={busy || problems.length > 0} onclick={() => onsave(true)}>{primary}</Button>
    {#if secondary}
      <Button variant="outline" size="md" disabled={busy || problems.length > 0} onclick={() => onsave(false)}>{secondary}</Button>
    {/if}
  </div>
  {#if footnote}
    <span class="flex items-center gap-2 text-caption text-text-dim"><Info size={14} />{footnote}</span>
  {/if}
</section>
