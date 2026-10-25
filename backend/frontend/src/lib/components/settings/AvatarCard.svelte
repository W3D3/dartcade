<script lang="ts">
  // Settings' Profile: your avatar — the Dartcade mark in one finish (foreground) on a disc in
  // another (background), each picked on its own, or (behind the avatar.upload.enabled flag, off
  // by default: not meant to ship yet) a photo. Finishes are progression rewards: Classic is
  // everyone's, the others unlock by level, streak, ranked deed or challenge (locked ones show what
  // unlocks them). Picking applies at once; "Use initials" opts back out to bare initials.
  import { Camera, Lock } from '@lucide/svelte'
  import { AVATAR_FINISHES, DEFAULT_AVATAR_FINISH } from '$shared/avatarFinishes.js'
  import { pictureUnlock } from '$lib/progress/pictures'
  import Avatar from '$lib/components/Avatar.svelte'
  import FinishPicture from '$lib/components/FinishPicture.svelte'
  import ErrorText from '$lib/components/ErrorText.svelte'
  import { api } from '$lib/api'
  import { currentUser } from '$lib/auth'
  import { flag } from '$lib/flags'
  import { resizeAvatarPhoto } from '$lib/avatarUpload'

  let busy = $state(false)
  let error = $state('')

  const avatar = $derived($currentUser?.avatar ?? { kind: 'none' as const })
  const userId = $derived($currentUser?.id ?? null)
  const name = $derived($currentUser?.name ?? '')
  const uploadEnabled = flag('avatar.upload.enabled')
  const pictures = $derived($currentUser?.pictures ?? [DEFAULT_AVATAR_FINISH])
  const worn = $derived(avatar.kind === 'preset' ? avatar : { foreground: DEFAULT_AVATAR_FINISH, background: DEFAULT_AVATAR_FINISH })
  const LAYERS = [
    { key: 'foreground', label: 'Foreground' },
    { key: 'background', label: 'Background' },
  ] as const

  type PresetChoice = { kind: 'preset'; foreground: string; background: string }

  async function setChoice(choice: { kind: 'none' } | PresetChoice) {
    busy = true
    error = ''
    try {
      const res = await api.PATCH('/api/me', { body: { avatar: choice } })
      if (res.error) {
        error = res.error.error
        return
      }
      await currentUser.refresh()
    } finally {
      busy = false
    }
  }

  /** Picking one layer keeps the other as it is (classic the first time). */
  function pickLayer(layer: 'foreground' | 'background', finish: string) {
    void setChoice({ kind: 'preset', foreground: worn.foreground, background: worn.background, [layer]: finish })
  }

  async function upload(file: File) {
    busy = true
    error = ''
    try {
      const blob = await resizeAvatarPhoto(file)
      const res = await fetch('/api/me/avatar', { method: 'POST', headers: { 'content-type': 'image/jpeg' }, body: blob })
      if (!res.ok) {
        const body: unknown = await res.json().catch(() => null)
        const message = body !== null && typeof body === 'object' && 'error' in body && typeof body.error === 'string' ? body.error : null
        error = message ?? "Couldn't upload that photo."
        return
      }
      await currentUser.refresh()
    } catch {
      error = "Couldn't upload that photo."
    } finally {
      busy = false
    }
  }
</script>

<section aria-label="Profile picture" class="box-border p-4 md:p-[22px] card flex flex-col gap-[18px]">
  <div class="flex items-center gap-4">
    <Avatar {name} {avatar} {userId} tone="accent" class="w-14 h-14 md:w-[72px] md:h-[72px] text-[24px] md:text-[30px]" />
    <div class="flex flex-col gap-[6px]">
      <span class="text-[15px] font-semibold">Profile picture</span>
      {#if $uploadEnabled}
        <label
          class="inline-flex w-fit items-center gap-[6px] text-[13px] font-semibold text-accent cursor-pointer {busy
            ? 'opacity-50 pointer-events-none'
            : ''}"
        >
          <Camera size={16} />
          Upload a photo
          <input
            type="file"
            accept="image/*"
            class="sr-only"
            disabled={busy}
            onchange={e => {
              const file = e.currentTarget.files?.[0]
              e.currentTarget.value = ''
              if (file) void upload(file)
            }}
          />
        </label>
      {/if}
    </div>
  </div>
  {#each LAYERS as layer (layer.key)}
    <div class="flex flex-col gap-2">
      <span class="text-[12px] font-semibold label-caps text-text-dim">{layer.label}</span>
      <div class="flex flex-wrap items-center gap-[10px]">
        {#each AVATAR_FINISHES as f (f.id)}
          {@const open = pictures.includes(f.id)}
          {@const selected = avatar.kind === 'preset' && worn[layer.key] === f.id}
          <button
            type="button"
            aria-label={open ? `Use ${f.name} for the ${layer.key}` : `${f.name}: ${pictureUnlock(f.id)}`}
            title={open ? f.name : `${f.name}: ${pictureUnlock(f.id)}`}
            aria-pressed={selected}
            disabled={busy || !open}
            onclick={() => pickLayer(layer.key, f.id)}
            class="group relative rounded-full disabled:cursor-default {selected
              ? 'ring-2 ring-accent ring-offset-2 ring-offset-surface-panel'
              : ''}"
          >
            <!-- Locked ones are grey until you look at them -->
            <span
              class="flex transition-[filter,opacity] duration-200 {open
                ? ''
                : 'opacity-40 grayscale group-hover:opacity-100 group-hover:grayscale-0 group-focus-visible:opacity-100 group-focus-visible:grayscale-0'}"
            >
              <FinishPicture
                foreground={layer.key === 'foreground' ? f.id : null}
                background={layer.key === 'background' ? f.id : null}
                size={40}
              />
            </span>
            {#if !open}
              <span
                class="absolute -right-1 -bottom-1 size-[18px] rounded-full bg-surface-2 border border-line-3 flex items-center justify-center text-text-muted"
                ><Lock size={10} /></span
              >
            {/if}
          </button>
        {/each}
      </div>
    </div>
  {/each}
  <button
    type="button"
    onclick={() => void setChoice({ kind: 'none' })}
    disabled={busy || avatar.kind === 'none'}
    class="h-10 w-fit rounded-full border border-line px-3 text-[13px] font-semibold text-text-muted hover:text-text disabled:opacity-50"
  >
    Use initials
  </button>
  {#if error}<ErrorText>{error}</ErrorText>{/if}
</section>
