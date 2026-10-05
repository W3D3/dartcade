<script lang="ts">
  // One radio of the account menu's "Your status" group (User-Badge): dot preview, title,
  // description, check when selected.
  import { Check } from '@lucide/svelte'
  import StatusDot from './StatusDot.svelte'

  let {
    title,
    text,
    kind,
    checked,
    onpick,
  }: { title: string; text: string; kind: 'online' | 'offline'; checked: boolean; onpick: () => void } = $props()
</script>

<button
  type="button"
  role="radio"
  aria-checked={checked}
  onclick={onpick}
  class="w-full flex items-start gap-3 p-[10px] rounded-[10px] border-0 text-left cursor-pointer font-[inherit] text-text
         {checked ? 'bg-surface-paused' : 'bg-transparent hover:bg-surface-hover'}"
>
  <StatusDot {kind} class="mt-1" />
  <span class="flex flex-col gap-[2px] flex-grow">
    <span class="text-[14px] font-semibold">{title}</span>
    <span class="text-[12px] leading-[1.35] text-text-muted">{text}</span>
  </span>
  <Check size={16} class="mt-[2px] text-accent {checked ? '' : 'invisible'}" />
</button>
