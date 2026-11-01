<script lang="ts">
  // A country's flag (the profile boards: next to the name, on hover its name). Draws nothing for
  // no country or a code without a flag.
  import { countryName, flagUrl } from '$lib/countries'

  const SIZE = { sm: 'h-[15px] w-[22.5px]', md: 'h-4 w-6', lg: 'h-[18px] w-[27px]', xl: 'h-5 w-[30px]' } as const

  let { code, size = 'sm' }: { code: string | null | undefined; size?: keyof typeof SIZE } = $props()

  const url = $derived(code ? flagUrl(code) : null)
</script>

{#if code && url}
  <img
    src={url}
    alt={countryName(code)}
    title={countryName(code)}
    loading="lazy"
    class="inline-block shrink-0 rounded-[3px] object-cover [box-shadow:0_0_0_1px_rgba(255,255,255,0.18)] {SIZE[size]}"
  />
{/if}
