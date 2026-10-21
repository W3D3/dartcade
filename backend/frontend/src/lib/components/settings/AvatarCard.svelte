<script lang="ts">
  // Settings' Profile: your avatar — upload a photo, pick a built-in preset, or go back to your
  // initials. Picking a preset applies at once; a photo is resized/cropped to a square in the
  // browser (lib/avatarUpload.ts) before it's uploaded, so the backend only has to store bytes.
  import { Camera, Check } from '@lucide/svelte'
  import { AVATAR_PRESETS } from '$shared/avatarPresets.js'
  import Avatar from '$lib/components/Avatar.svelte'
  import ErrorText from '$lib/components/ErrorText.svelte'
  import { api } from '$lib/api'
  import { currentUser } from '$lib/auth'
  import { resizeAvatarPhoto } from '$lib/avatarUpload'

  let busy = $state(false)
  let error = $state('')

  const avatar = $derived($currentUser?.avatar ?? { kind: 'none' as const })
  const userId = $derived($currentUser?.id ?? null)
  const name = $derived($currentUser?.name ?? '')

  async function setChoice(choice: { kind: 'none' } | { kind: 'preset'; preset: string }) {
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
    </div>
  </div>
  <div class="flex flex-wrap items-center gap-[10px]">
    {#each AVATAR_PRESETS as p (p.id)}
      {@const selected = avatar.kind === 'preset' && avatar.preset === p.id}
      <button
        type="button"
        aria-label="Use the {p.id} avatar"
        aria-pressed={selected}
        disabled={busy}
        onclick={() => void setChoice({ kind: 'preset', preset: p.id })}
        class="relative rounded-full disabled:opacity-50 {selected ? 'ring-2 ring-accent ring-offset-2 ring-offset-surface-panel' : ''}"
      >
        <Avatar name="" avatar={{ kind: 'preset', preset: p.id }} size={40} />
        {#if selected}
          <span
            class="absolute -right-1 -bottom-1 flex h-[18px] w-[18px] items-center justify-center rounded-full border-2 border-surface-panel bg-accent text-accent-fg"
          >
            <Check size={11} />
          </span>
        {/if}
      </button>
    {/each}
    <button
      type="button"
      onclick={() => void setChoice({ kind: 'none' })}
      disabled={busy || avatar.kind === 'none'}
      class="h-10 rounded-full border border-line px-3 text-[13px] font-semibold text-text-muted hover:text-text disabled:opacity-50"
    >
      Use initials
    </button>
  </div>
  {#if error}<ErrorText>{error}</ErrorText>{/if}
</section>
