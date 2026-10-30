<!-- One imported voice pack (`#/voice-packs/<id>`), behind the caller.packDetails flag: every sound the
     caller can ask a voice for, and a preview for each one the pack has. Opened from the pack's Details
     button in Settings → Caller. -->
<script lang="ts">
  import { onDestroy, onMount } from 'svelte'
  import Layout from '$lib/components/Layout.svelte'
  import PageMain from '$lib/components/PageMain.svelte'
  import PageTitle from '$lib/components/PageTitle.svelte'
  import ErrorText from '$lib/components/ErrorText.svelte'
  import PreviewButton from '$lib/components/PreviewButton.svelte'
  import { CATALOGUE, haveOf, otherKeys } from '$lib/caller/catalogue.js'
  import { createCaller } from '$lib/caller/player.js'
  import { BUILTIN_PREFIX, loadVoiceLibrary, packClips, voiceClips, voiceLibrary, type Clips } from '$lib/caller/voices.js'
  import { flag } from '$lib/flags'
  import { loadSettings } from '$lib/gameSettings.js'
  import { audioContext } from '$lib/sounds.js'
  import { deviceStore } from '$lib/storage'

  let { params }: { params: { id: string } } = $props()

  const enabled = flag('caller.packDetails')
  const volume = loadSettings(deviceStore()).volume
  const caller = createCaller(() => volume)
  onDestroy(() => caller.stop())

  let clips = $state<Clips | null>(null)
  let failed = $state(false)
  const builtin = $derived(params.id.startsWith(BUILTIN_PREFIX) ? params.id.slice(BUILTIN_PREFIX.length) : null)
  const pack = $derived($voiceLibrary.packs.find(p => p.id === params.id))
  const name = $derived((builtin ? $voiceLibrary.builtins.find(b => b.id === builtin)?.name : pack?.name) ?? 'Voice pack')
  const others = $derived(clips ? otherKeys(clips) : [])
  const total = $derived(CATALOGUE.reduce((n, g) => n + g.keys.length, 0))
  const have = $derived.by(() => {
    const c = clips
    return c ? CATALOGUE.reduce((n, g) => n + haveOf(g, c).have, 0) : 0
  })

  onMount(() => {
    if (!$voiceLibrary.loaded) void loadVoiceLibrary()
    void (builtin ? voiceClips(params.id) : packClips(params.id)).then(c => {
      clips = c
      failed = c === null
    })
  })

  /** Says one clip of `key`; resolves once it has loaded and started, with how long it rings. */
  async function play(key: string, url: string): Promise<number> {
    audioContext()
    await caller.say([[key]], { [key]: [url] })
    return caller.remaining()
  }
</script>

{#snippet sound(key: string, label: string)}
  {@const urls = clips && key in clips ? clips[key] : []}
  <li
    class="flex items-center gap-1 min-h-9 pl-3 pr-1 rounded-[9px] border border-line text-[13px] {urls.length
      ? 'bg-surface-row text-text'
      : 'text-text-dim opacity-60'}"
  >
    <span class="mr-auto truncate">{label}</span>
    {#each urls as url, i (i)}
      <PreviewButton
        label="Play {label}{urls.length > 1 ? ` (${i + 1} of ${urls.length})` : ''}"
        onplay={() => play(key, url)}
        iconSize={12}
        class="size-7 rounded-[7px]"
      />
    {/each}
  </li>
{/snippet}

<Layout title={name}>
  <PageMain>
    <PageTitle
      trail={[{ label: 'Settings', href: '#/settings' }, { label: 'Caller', href: '#/settings/caller' }, { label: name }]}
      title={name}
      sub={clips ? `${have} of ${total} sounds` : 'Every sound the caller can use, and a preview of the ones this voice has'}
    />
    {#if !$enabled}
      <p class="m-0 text-[15px] text-text-dim">Voice pack details aren't available to you yet.</p>
    {:else if failed}
      <ErrorText>This voice couldn't be loaded. It may have been deleted.</ErrorText>
    {:else if !clips}
      <p class="m-0 text-[15px] text-text-dim">Loading…</p>
    {:else}
      {#each CATALOGUE as group (group.id)}
        {@const count = haveOf(group, clips)}
        <section class="flex flex-col gap-3" aria-labelledby="vp-{group.id}">
          <div class="flex flex-col gap-[2px]">
            <h2 id="vp-{group.id}" class="m-0 font-display font-bold text-[22px] leading-none uppercase">
              {group.title}
              <span class="ml-2 font-body text-[13px] font-normal normal-case text-text-dim">{count.have} of {count.total}</span>
            </h2>
            <p class="m-0 text-[13px] text-text-dim">{group.hint}</p>
          </div>
          <ul class="m-0 p-0 list-none grid grid-cols-[repeat(auto-fill,minmax(130px,1fr))] gap-[6px]">
            {#each group.keys as k (k.key)}
              {@render sound(k.key, k.label)}
            {/each}
          </ul>
        </section>
      {/each}
      {#if others.length}
        <section class="flex flex-col gap-3" aria-labelledby="vp-other">
          <div class="flex flex-col gap-[2px]">
            <h2 id="vp-other" class="m-0 font-display font-bold text-[22px] leading-none uppercase">Other</h2>
            <p class="m-0 text-[13px] text-text-dim">In this voice, but not something the caller says yet</p>
          </div>
          <ul class="m-0 p-0 list-none grid grid-cols-[repeat(auto-fill,minmax(130px,1fr))] gap-[6px]">
            {#each others as key (key)}
              {@render sound(key, key)}
            {/each}
          </ul>
        </section>
      {/if}
    {/if}
  </PageMain>
</Layout>
