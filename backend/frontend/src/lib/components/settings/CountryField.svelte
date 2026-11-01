<script lang="ts">
  // Settings' Profile: the country shown as a flag next to your name (Settings-Country board).
  // Optional, saved as soon as one is picked, and public: everyone who sees your profile sees it.
  import Flag from '$lib/components/Flag.svelte'
  import ErrorText from '$lib/components/ErrorText.svelte'
  import Select from '$lib/components/ui/select/select.svelte'
  import { api } from '$lib/api'
  import { currentUser } from '$lib/auth'
  import { COUNTRY_OPTIONS, countryName } from '$lib/countries'
  import { refreshProfile } from '$lib/progress/profiles'

  const NONE = ''
  const options = [{ value: NONE, label: 'Don’t show a country' }, ...COUNTRY_OPTIONS]
  const country = $derived($currentUser?.country ?? null)
  let error = $state('')

  async function save(value: string) {
    if (!$currentUser) return
    error = ''
    const res = await api.PATCH('/api/me', { body: { country: value === NONE ? null : value } })
    if (res.error) {
      error = "Couldn't save the country. Try again."
      return
    }
    await currentUser.refresh()
    refreshProfile($currentUser.id)
  }
</script>

<div class="flex flex-col gap-2">
  <span id="settings-country" class="flex items-baseline gap-2 text-[14px] font-medium text-ink-soft"
    >Country <span class="text-[13px] font-normal text-text-dim">· optional</span></span
  >
  <div class="flex items-center gap-3">
    <Select label="Country" value={country ?? NONE} onchange={(v: string) => void save(v)} {options} class="w-full sm:w-[280px]" />
    <Flag code={country} class="!h-[20px] !w-[30px]" />
  </div>
  <span class="text-[13px] leading-[1.5] text-text-dim"
    >{country
      ? `A flag for ${countryName(country)} next to your name on your profile and on hover.`
      : 'A flag next to your name on your profile and on hover.'}
    Everyone who can see your profile sees it, not only friends. Saved as soon as you pick one.</span
  >
  {#if error}<ErrorText>{error}</ErrorText>{/if}
</div>
