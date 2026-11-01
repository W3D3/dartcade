<script lang="ts">
  // Settings' Profile: the country shown as a flag next to your name (Settings-Country board).
  // Optional, saved as soon as one is picked, and public: everyone who sees your profile sees it.
  import ErrorText from '$lib/components/ErrorText.svelte'
  import CountryPicker from './CountryPicker.svelte'
  import { api } from '$lib/api'
  import { currentUser } from '$lib/auth'
  import { refreshProfile } from '$lib/progress/profiles'

  let error = $state('')

  async function save(country: string | null) {
    if (!$currentUser) return
    error = ''
    const res = await api.PATCH('/api/me', { body: { country } })
    if (res.error) {
      error = "Couldn't save the country. Try again."
      return
    }
    await currentUser.refresh()
    refreshProfile($currentUser.id)
  }
</script>

<div class="flex min-w-0 flex-col gap-2">
  <span class="flex items-baseline gap-2 text-[15px] font-semibold"
    >Country <span class="text-[13px] font-normal text-text-dim">· optional</span></span
  >
  <CountryPicker value={$currentUser?.country ?? null} onchange={(code: string | null) => void save(code)} />
  <span class="text-[13px] leading-[1.5] text-text-dim"
    >A flag next to your name on your profile and on hover. Everyone who can see your profile sees it, not only friends. Saved as soon as
    you pick one.</span
  >
  {#if error}<ErrorText>{error}</ErrorText>{/if}
</div>
