<script lang="ts">
  import { Tooltip } from 'bits-ui'
  let { text, class: className = '' }: { text: string; class?: string } = $props()
</script>

<Tooltip.Root delayDuration={300}>
  <Tooltip.Trigger
    type="button"
    class="w-[18px] h-[18px] rounded-full border border-line-3 inline-flex items-center justify-center
           text-[11px] font-bold text-text-dim bg-transparent cursor-help leading-none {className}">
    ?
  </Tooltip.Trigger>
  <Tooltip.Portal>
    <Tooltip.Content
      side="top"
      sideOffset={8}
      class="z-[9999] w-[220px] px-3 py-2 rounded-[8px] text-[13px] leading-[1.45] text-text
             bg-[#1e211b] border border-line-3 [box-shadow:0_4px_16px_rgba(0,0,0,0.5)]
             pointer-events-none whitespace-normal">
      {text}
    </Tooltip.Content>
  </Tooltip.Portal>
</Tooltip.Root>
