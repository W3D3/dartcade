<script lang="ts">
  // Terms, Privacy Policy and Imprint (#/terms, #/privacy, #/imprint), see Legal.dc.html / Mobile-Legal.dc.html.
  import { location } from 'svelte-spa-router'
  import Wordmark from '$lib/components/Wordmark.svelte'
  import { api } from '$lib/api'

  type Doc = 'terms' | 'privacy' | 'imprint'
  const TITLES: Record<Doc, string> = { terms: 'Terms', privacy: 'Privacy', imprint: 'Imprint' }
  const isDoc = (s: string): s is Doc => s in TITLES

  const doc = $derived.by(() => {
    const path = $location.slice(1)
    return isDoc(path) ? path : 'terms'
  })

  let html = $state('')
  let updated = $state<string | null>(null)
  let loaded = $state<Doc | null>(null)

  $effect(() => {
    const current = doc
    void (async () => {
      const { data } = await api.GET('/api/legal/{doc}', { params: { path: { doc: current } } })
      if (data) {
        html = data.html
        updated = data.updated
      }
      loaded = current
    })()
  })
</script>

<div class="min-h-dvh bg-bg flex flex-col items-center">
  <div class="w-full max-w-[720px] box-border px-5 md:px-0 pt-8 md:pt-10 pb-16 flex flex-col gap-6 md:gap-7">
    <Wordmark size={26} text="text-[21px] md:text-[24px]" badge={false} />

    <div class="flex flex-col gap-[10px] border-b border-line pb-4">
      <nav aria-label="Legal documents" class="flex gap-[18px] md:gap-5">
        {#each Object.entries(TITLES) as [id, label] (id)}
          <a
            href="#/{id}"
            aria-current={doc === id ? 'page' : undefined}
            class="text-[14px] md:text-[15px] no-underline {doc === id ? 'font-semibold text-text' : 'font-medium text-text-muted'}"
          >
            {label}
          </a>
        {/each}
      </nav>
      {#if updated}
        <span class="text-[12px] md:text-[13px] text-text-dim">Last updated {updated}</span>
      {/if}
    </div>

    {#if loaded === doc}
      <div class="legal-content">
        <!-- eslint-disable-next-line svelte/no-at-html-tags -- the backend renders the operator's own Markdown (backend/src/legal), not user input -->
        {@html html}
      </div>
    {:else}
      <p class="m-0 text-[15px] text-text-muted">Loading…</p>
    {/if}
  </div>
</div>

<style>
  /* The text comes from the operator's own Markdown (backend/src/legal/defaults), rendered server-side. */
  .legal-content :global(h1) {
    margin: 0 0 6px;
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 30px;
    line-height: 1;
    text-transform: uppercase;
    letter-spacing: 0.02em;
  }
  @media (min-width: 768px) {
    .legal-content :global(h1) {
      font-size: 40px;
    }
  }
  .legal-content :global(h2) {
    margin: 22px 0 8px;
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 19px;
    line-height: 1.2;
  }
  @media (min-width: 768px) {
    .legal-content :global(h2) {
      margin: 28px 0 10px;
      font-size: 22px;
      letter-spacing: 0.01em;
    }
  }
  .legal-content :global(p) {
    margin: 0 0 12px;
    font-size: 14px;
    line-height: 1.55;
    color: var(--color-ink-2);
  }
  .legal-content :global(ul) {
    margin: 0 0 12px;
    padding-left: 18px;
    font-size: 14px;
    line-height: 1.55;
    color: var(--color-ink-2);
    list-style: disc;
  }
  .legal-content :global(li) {
    margin-bottom: 6px;
  }
  @media (min-width: 768px) {
    .legal-content :global(p),
    .legal-content :global(ul) {
      font-size: 15px;
      line-height: 1.6;
      margin-bottom: 14px;
    }
  }
  .legal-content :global(table) {
    width: 100%;
    margin: 0 0 14px;
    border-collapse: collapse;
    font-size: 13px;
    line-height: 1.5;
    color: var(--color-ink-2);
  }
  .legal-content :global(th),
  .legal-content :global(td) {
    border: 1px solid var(--color-line);
    padding: 8px 10px;
    text-align: left;
    vertical-align: top;
  }
  .legal-content :global(th) {
    background: var(--color-surface-panel);
    color: var(--color-ink-soft);
    font-weight: 600;
  }
</style>
