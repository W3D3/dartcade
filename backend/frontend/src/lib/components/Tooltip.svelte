<script lang="ts">
  import { Popover } from 'bits-ui'
  let { text, class: className = '' }: { text: string; class?: string } = $props()
  let open = $state(false)
</script>

<svelte:window onscrollcapture={() => (open = false)} />

<Popover.Root bind:open>
  <Popover.Trigger
    type="button"
    aria-label="Help"
    class="w-[18px] h-[18px] rounded-full border border-line-3 inline-flex items-center justify-center
           text-[11px] font-bold text-text-dim bg-transparent cursor-help leading-none {className}"
  >
    ?
  </Popover.Trigger>
  <Popover.Portal>
    <Popover.Content
      side="top"
      sideOffset={8}
      collisionPadding={8}
      class="z-[60] w-[220px] px-3 py-2 rounded-[8px] text-[13px] leading-[1.45] text-text
             bg-[#1e211b] border border-line-3 shadow-tooltip whitespace-normal"
    >
      {text}
    </Popover.Content>
  </Popover.Portal>
</Popover.Root>
