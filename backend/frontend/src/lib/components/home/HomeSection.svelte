<script lang="ts">
  // One of Home's panels: a title, an optional link to the full page, and the section's content.
  // While `loading` it shows a spinner, and a refusal in red; the content shows once there is data.
  import type { Snippet } from 'svelte'
  import { LoaderCircle } from '@lucide/svelte'
  import ErrorText from '$lib/components/ErrorText.svelte'

  let {
    title,
    link,
    loading = false,
    error = '',
    class: className = '',
    children,
  }: {
    title: string
    link?: { label: string; href: string }
    loading?: boolean
    error?: string
    class?: string
    children: Snippet
  } = $props()
</script>

<section
  aria-label={title}
  class="box-border flex min-w-0 flex-col gap-3 rounded-[14px] border border-line bg-surface-panel p-4 md:p-5 {className}"
>
  <div class="flex items-center justify-between gap-3">
    <h2 class="m-0 font-display text-[22px] font-bold uppercase leading-none tracking-[0.04em]">{title}</h2>
    {#if link}<a href={link.href} class="text-[13px] font-semibold text-accent no-underline">{link.label}</a>{/if}
  </div>
  {#if error}
    <ErrorText>{error}</ErrorText>
  {:else if loading}
    <div class="flex justify-center py-6 text-text-muted"><LoaderCircle class="animate-spin" size={22} aria-label="Loading" /></div>
  {:else}
    {@render children()}
  {/if}
</section>
