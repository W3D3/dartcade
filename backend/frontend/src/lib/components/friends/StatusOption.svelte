<script lang="ts">
  // One radio of the account menu's "Your status" group (User-Badge): dot preview, title,
  // description, check when selected. Picking it leaves the menu open.
  import { DropdownMenu } from 'bits-ui'
  import { Check } from '@lucide/svelte'
  import StatusDot from './StatusDot.svelte'

  let { title, text, kind, value }: { title: string; text: string; kind: 'online' | 'offline'; value: string } = $props()
</script>

<DropdownMenu.RadioItem
  {value}
  textValue={title}
  closeOnSelect={false}
  class="w-full flex items-start gap-3 p-[10px] rounded-[10px] text-left cursor-pointer text-text outline-none
         bg-transparent data-[highlighted]:bg-surface-hover data-[state=checked]:bg-surface-paused"
>
  {#snippet children({ checked })}
    <StatusDot {kind} class="mt-1" />
    <span class="flex flex-col gap-[2px] flex-grow">
      <span class="text-[14px] font-semibold">{title}</span>
      <span class="text-[12px] leading-[1.35] text-text-muted">{text}</span>
    </span>
    <Check size={16} class="mt-[2px] text-accent {checked ? '' : 'invisible'}" />
  {/snippet}
</DropdownMenu.RadioItem>
