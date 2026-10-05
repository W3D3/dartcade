<script lang="ts">
  // A board on the Boards page: online or not, its name and Board Manager host, bridge and games.
  import { Badge } from '$lib/components/ui/badge/index.js'
  import type { Board } from '$lib/api'
  import { bmHost, fmtVersion } from '$lib/boards'

  let { board, active, justPaired, onselect }: { board: Board; active: boolean; justPaired: boolean; onselect: () => void } = $props()
</script>

<button
  type="button"
  onclick={onselect}
  aria-pressed={active}
  class="text-left box-border p-[22px] md:max-xl:p-5 rounded-[14px] flex flex-col gap-[18px] md:max-xl:gap-4 transition-colors
         {justPaired || active ? 'bg-surface-2 border-2 border-accent' : 'bg-surface-2 border border-line-2 hover:border-line'}"
>
  <div class="flex justify-between items-center">
    {#if justPaired && !board.online}
      <span class="flex items-center gap-2 text-[13px] font-semibold text-text-muted">
        <span class="w-2 h-2 rounded-full border border-accent border-t-transparent animate-spin"></span>
        Connecting cameras…
      </span>
      <Badge variant="paired">Just paired</Badge>
    {:else}
      <span
        class="flex items-center gap-2 text-[13px] font-semibold
                   {board.online ? 'text-accent' : 'text-text-dim'}"
      >
        <span class="w-2 h-2 rounded-full {board.online ? 'bg-accent' : 'bg-text-dim'}"></span>
        {board.online ? 'Online' : 'Offline'}
      </span>
      {#if justPaired}
        <Badge variant="paired">Just paired</Badge>
      {/if}
    {/if}
    {#if !justPaired}
      <Badge variant="soon">Latency · soon</Badge>
    {/if}
  </div>

  <div class="flex flex-col gap-1">
    <h2 class="m-0 font-display font-bold text-[32px] md:max-xl:text-[30px] leading-none uppercase">{board.name}</h2>
    {#if board.ip}
      <span class="font-mono text-[13px] text-text-muted">{bmHost(board)}</span>
    {/if}
  </div>

  <dl class="m-0 mt-auto grid grid-cols-2 gap-3 pt-4 md:max-xl:pt-[14px] border-t border-line-2">
    <div>
      <dt class="text-[12px] text-text-dim">Bridge</dt>
      <dd class="mt-1 m-0 text-[15px] font-semibold">{fmtVersion(board.bridgeVersion) ?? '—'}</dd>
    </div>
    <div>
      <dt class="text-[12px] text-text-dim">Games</dt>
      <dd class="mt-1 m-0 text-[15px] font-semibold">—</dd>
    </div>
  </dl>
</button>
