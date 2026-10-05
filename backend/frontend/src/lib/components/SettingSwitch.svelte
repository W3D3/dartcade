<script lang="ts">
  // A setting that's on or off: its label (and a line under it) and a switch on the right.
  let {
    id,
    label,
    sub,
    checked = $bindable(),
    onchange,
  }: {
    id: string
    label: string
    sub?: string
    checked: boolean
    /** After a tap flipped it (a user gesture, e.g. to wake audio). */
    onchange?: (checked: boolean) => void
  } = $props()
</script>

<div class="flex items-center justify-between gap-4">
  <span class="flex flex-col gap-[2px]">
    <span {id} class="text-[15px] text-text">{label}</span>
    {#if sub}<span class="text-[13px] text-text-dim">{sub}</span>{/if}
  </span>
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-labelledby={id}
    onclick={() => {
      checked = !checked
      onchange?.(checked)
    }}
    class="relative w-12 h-7 shrink-0 rounded-full border-0 p-0 cursor-pointer transition-colors
           {checked ? 'bg-accent' : 'bg-line-chip'}"
  >
    <span
      class="absolute top-[3px] left-[3px] w-[22px] h-[22px] rounded-full transition-transform
                 {checked ? 'translate-x-5 bg-accent-fg' : 'bg-text'}"
    ></span>
  </button>
</div>
