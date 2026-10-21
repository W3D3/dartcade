<script lang="ts">
  // Settings' Profile: your avatar — a picture on a background and foreground colour you pick
  // independently, or (behind the avatar.upload.enabled flag, off by default: not meant to ship
  // yet) a photo. Pictures are progression rewards: the Dartcade mark is everyone's, the others
  // unlock by level, streak or ranked deed (locked ones show what unlocks them). Picking applies at once; "Use initials" opts back out to bare initials.
  import { Camera, Check, Lock } from '@lucide/svelte'
  import { AVATAR_COLORS, AVATAR_PRESETS, DEFAULT_AVATAR_BG, DEFAULT_AVATAR_FG, DEFAULT_AVATAR_PRESET } from '$shared/avatarPresets.js'
  import { picturePerk, pictureUnlock, presetIn } from '$lib/progress/pictures'
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
  const pictures = $derived($currentUser?.pictures ?? [DEFAULT_AVATAR_PRESET])

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
    <span class="text-[12px] font-semibold label-caps text-text-dim">Picture</span>
    <div class="flex flex-wrap items-center gap-[10px]">
      {#each AVATAR_PRESETS as p (p.id)}
        {@const open = pictures.includes(p.id)}
        {@const selected = avatar.kind === 'preset' && avatar.preset === p.id}
        <button
          type="button"
          aria-label={open
            ? `Use the ${picturePerk(p.id)?.name ?? p.id} picture`
            : `${picturePerk(p.id)?.name ?? p.id}: unlocks at ${pictureUnlock(p.id)}`}
          title={open ? picturePerk(p.id)?.name : `${picturePerk(p.id)?.name}: ${pictureUnlock(p.id)}`}
          aria-pressed={selected}
          disabled={busy || !open}
          onclick={() => void setChoice(presetIn(avatar, p.id))}
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
            <Avatar {name} avatar={presetIn(avatar, p.id)} size={40} />
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
