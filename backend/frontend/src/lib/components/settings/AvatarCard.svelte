<script lang="ts">
  // Settings' Profile: your avatar — the Dartcade mark on a background and foreground colour you
  // pick independently, or (behind the avatar.upload.enabled flag, off by default: not meant to
  // ship yet) a photo. More icons, and letting background/foreground ride on a wider palette,
  // unlock later through XP progression; for now there's one mark and a short list of basic
  // colours. Picking either colour applies at once; "Use initials" opts back out to bare initials.
  import { Camera, Check } from '@lucide/svelte'
  import { AVATAR_COLORS, DEFAULT_AVATAR_BG, DEFAULT_AVATAR_FG, DEFAULT_AVATAR_PRESET } from '$shared/avatarPresets.js'
  import Avatar from '$lib/components/Avatar.svelte'
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

  type PresetChoice = { kind: 'preset'; preset: string; color: string; fgColor: string }

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

  /** Picking a background colour keeps the current foreground (and vice versa); a sensible default the first time. */
  function pickBg(color: string) {
    void setChoice({
      kind: 'preset',
      preset: avatar.kind === 'preset' ? avatar.preset : DEFAULT_AVATAR_PRESET,
      color,
      fgColor: avatar.kind === 'preset' ? avatar.fgColor : DEFAULT_AVATAR_FG,
    })
  }
  function pickFg(fgColor: string) {
    void setChoice({
      kind: 'preset',
      preset: avatar.kind === 'preset' ? avatar.preset : DEFAULT_AVATAR_PRESET,
      color: avatar.kind === 'preset' ? avatar.color : DEFAULT_AVATAR_BG,
      fgColor,
    })
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
  <div class="flex flex-col gap-2">
    <span class="text-[12px] font-semibold label-caps text-text-dim">Background colour</span>
    <div class="flex flex-wrap items-center gap-[10px]">
      {#each AVATAR_COLORS as color (color)}
        {@const selected = avatar.kind === 'preset' && avatar.color === color}
        <button
          type="button"
          aria-label="Use this background colour"
          aria-pressed={selected}
          disabled={busy}
          onclick={() => pickBg(color)}
          style="background-color: {color}"
          class="relative h-7 w-7 rounded-full border border-line disabled:opacity-50 {selected
            ? 'ring-2 ring-accent ring-offset-2 ring-offset-surface-panel'
            : ''}"
        >
          {#if selected}
            <Check size={14} class="absolute inset-0 m-auto text-white mix-blend-difference" />
          {/if}
        </button>
      {/each}
    </div>
  </div>
  <div class="flex flex-col gap-2">
    <span class="text-[12px] font-semibold label-caps text-text-dim">Icon colour</span>
    <div class="flex flex-wrap items-center gap-[10px]">
      {#each AVATAR_COLORS as color (color)}
        {@const selected = avatar.kind === 'preset' && avatar.fgColor === color}
        <button
          type="button"
          aria-label="Use this icon colour"
          aria-pressed={selected}
          disabled={busy}
          onclick={() => pickFg(color)}
          style="background-color: {color}"
          class="relative h-7 w-7 rounded-full border border-line disabled:opacity-50 {selected
            ? 'ring-2 ring-accent ring-offset-2 ring-offset-surface-panel'
            : ''}"
        >
          {#if selected}
            <Check size={14} class="absolute inset-0 m-auto text-white mix-blend-difference" />
          {/if}
        </button>
      {/each}
    </div>
  </div>
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
