<script lang="ts">
  // The other side lost their connection: they have until the deadline to come back, then you win
  // by forfeit. Sits where the reserve banner would, over the board.
  import { WifiOff } from '@lucide/svelte'

  let { name, left, drain }: { name: string; left: string; drain: number } = $props()
</script>

<div
  role="status"
  class="relative box-border flex min-h-[76px] py-3 items-center gap-3 overflow-hidden rounded-lg border border-warn-line bg-warn-panel px-4"
>
  <WifiOff size={22} class="shrink-0 text-warn" aria-hidden="true" />
  <span class="flex min-w-0 flex-1 flex-col gap-[2px]">
    <span class="text-[13px] font-semibold label-caps text-warn">{name} lost connection</span>
    <span class="text-[13px] text-ink-2">Not back at 0:00: you win by forfeit</span>
  </span>
  <span class="font-mono text-[36px] font-medium leading-none text-warn">{left}</span>
  <span aria-hidden="true" class="absolute inset-x-0 bottom-0 h-[3px] bg-warn-panel-line"
    ><span class="block h-full origin-left bg-warn" style:transform="scaleX({drain})"></span></span
  >
</div>
