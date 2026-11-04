<script lang="ts">
  // Settings' Friends & privacy: Invisible, who sees when you were last online and your friends
  // list, and whether friend search finds you. Each choice saves at once.
  import SegmentedControl from '$lib/components/SegmentedControl.svelte'
  import SettingSwitch from '$lib/components/SettingSwitch.svelte'
  import ErrorText from '$lib/components/ErrorText.svelte'
  import SettingsCard from './SettingsCard.svelte'
  import { api } from '$lib/api'
  import { currentUser } from '$lib/auth'
  import { setInvisible } from '$lib/presence'

  let error = $state('')

  async function goInvisible(invisible: boolean) {
    error = (await setInvisible(invisible)) ?? ''
  }

  async function save(body: { showLastOnline?: 'friends' | 'nobody'; friendsVisibility?: 'friends' | 'me'; discoverable?: boolean }) {
    const res = await api.PATCH('/api/me', { body })
    error = res.error?.error ?? ''
    await currentUser.refresh()
  }
</script>

<SettingsCard id="friends-privacy" title="Friends & privacy" description="Who sees when you are around, and who can find you.">
  {#if $currentUser}
    <SettingSwitch
      id="privacy-invisible"
      label="Invisible"
      sub="Friends see you as offline, with no last online."
      checked={$currentUser.invisible}
      onchange={(v: boolean) => void goInvisible(v)}
    />
    <div class="flex items-center justify-between gap-4">
      <span id="privacy-last-online" class="text-[15px] text-text">Show when I was last online</span>
      <SegmentedControl
        labelledby="privacy-last-online"
        options={[
          { value: 'friends', label: 'Friends' },
          { value: 'nobody', label: 'Nobody' },
        ]}
        value={$currentUser.showLastOnline}
        onchange={v => void save({ showLastOnline: v === 'nobody' ? 'nobody' : 'friends' })}
      />
    </div>
    <div class="flex items-center justify-between gap-4">
      <span id="privacy-friends-list" class="text-[15px] text-text">Who can see my friends list</span>
      <SegmentedControl
        labelledby="privacy-friends-list"
        options={[
          { value: 'friends', label: 'Friends' },
          { value: 'me', label: 'Only me' },
        ]}
        value={$currentUser.friendsVisibility}
        onchange={v => void save({ friendsVisibility: v === 'me' ? 'me' : 'friends' })}
      />
    </div>
    <SettingSwitch
      id="privacy-discoverable"
      label="Discoverable in search"
      sub="Others find you by part of your name or your email. Adding you by your exact name always works."
      checked={$currentUser.discoverable}
      onchange={(v: boolean) => void save({ discoverable: v })}
    />
    {#if error}<ErrorText>{error}</ErrorText>{/if}
  {/if}
</SettingsCard>
