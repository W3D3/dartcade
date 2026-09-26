<script lang="ts">
  let { title, body, confirmLabel = 'Confirm', danger = false, onconfirm, oncancel }: {
    title: string
    body?: string
    confirmLabel?: string
    danger?: boolean
    onconfirm: () => void
    oncancel: () => void
  } = $props()
</script>

<!-- Backdrop -->
<div class="fixed inset-0 bg-black/60 flex items-center justify-center z-[200]"
  role="dialog" aria-modal="true" aria-labelledby="modal-title"
  onkeydown={(e) => e.key === 'Escape' && oncancel()}>

  <!-- Trap clicks outside the card -->
  <div class="absolute inset-0" onclick={oncancel} aria-hidden="true"></div>

  <!-- Card -->
  <div class="relative z-10 w-[380px] bg-[#1a1c18] border border-line-3 rounded-[14px]
              p-7 flex flex-col gap-5 [box-shadow:0_24px_60px_rgba(0,0,0,0.7)]">
    <div class="flex flex-col gap-2">
      <h2 id="modal-title" class="m-0 font-display font-bold text-[28px] uppercase leading-none">
        {title}
      </h2>
      {#if body}
        <p class="m-0 text-[15px] text-text-muted leading-[1.5]">{body}</p>
      {/if}
    </div>

    <div class="flex gap-3">
      <button type="button" onclick={oncancel}
        class="flex-1 h-12 rounded-[10px] border border-line-3 bg-transparent text-text
               text-[15px] font-medium cursor-pointer">
        Keep playing
      </button>
      <button type="button" onclick={onconfirm}
        class="flex-1 h-12 rounded-[10px] border-0 text-[15px] font-bold cursor-pointer
               {danger ? 'bg-live text-[#fff]' : 'bg-accent text-accent-fg'}">
        {confirmLabel}
      </button>
    </div>
  </div>
</div>
