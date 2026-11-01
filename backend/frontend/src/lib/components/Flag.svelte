<script lang="ts">
  // A country's flag (the profile boards: next to the name, on hover its name). Draws nothing for
  // no country or a code without a flag.
  import { countryName, flagUrl } from '$lib/countries'

  let { code, class: className = '' }: { code: string | null | undefined; class?: string } = $props()

  const url = $derived(code ? flagUrl(code) : null)
</script>

{#if code && url}
  <img
    src={url}
    alt={countryName(code)}
    title={countryName(code)}
    loading="lazy"
    class="inline-block h-[15px] w-[22.5px] shrink-0 rounded-[3px] object-cover [box-shadow:0_0_0_1px_rgba(255,255,255,0.18)] {className}"
  />
{/if}
