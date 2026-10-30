<script lang="ts">
  // A board on the Boards page: online or not, its name and Board Manager host, bridge, games and lights.
  import { Badge } from '$lib/components/ui/badge/index.js'
  import type { Board } from '$lib/api'
  import { bmHost, fmtVersion } from '$lib/boards'

  let {
    board,
    active,
    justPaired,
    onselect,
    lights,
  }: { board: Board; active: boolean; justPaired: boolean; onselect: () => void; lights?: number } = $props()
</script>

<button
  type="button"
  onclick={onselect}
  aria-pressed={active}
  class="text-left box-border p-4 rounded-[12px] flex flex-col gap-3 transition-colors
         outline-none focus-visible:[outline:2px_solid_var(--color-accent)] focus-visible:[outline-offset:2px]
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
    <h2 class="m-0 font-display font-bold text-[24px] leading-none uppercase">{board.name}</h2>
    {#if board.ip}
      <span class="font-mono text-[13px] text-text-muted">{bmHost(board)}{board.bmVersion ? ` · ${fmtVersion(board.bmVersion)}` : ''}</span>
    {/if}
    {#if board.sharedBy}
      <span class="text-[12px] text-text-dim">Shared by {board.sharedBy}</span>
    {/if}
  </div>

  <dl class="m-0 mt-auto grid {lights === undefined ? 'grid-cols-2' : 'grid-cols-3'} gap-3 pt-3 border-t border-line-2">
    <div>
      <dt class="text-[12px] text-text-dim">Bridge</dt>
      <dd class="mt-0.5 m-0 text-[14px] font-semibold">
        {fmtVersion(board.bridgeVersion) ?? '—'}{#if board.bridgeUpdate.available}<span class="block text-[12px] font-medium text-accent"
            >Update</span
          >{/if}
      </dd>
    </div>
    <div>
      <dt class="text-[12px] text-text-dim">Games</dt>
      <dd class="mt-0.5 m-0 text-[14px] font-semibold">—</dd>
    </div>
    {#if lights !== undefined}
      <div>
        <dt class="text-[12px] text-text-dim">Lights</dt>
        <dd class="mt-0.5 m-0 text-[14px] font-semibold">{lights ? `${lights} device${lights === 1 ? '' : 's'}` : '—'}</dd>
      </div>
    {/if}
  </dl>
</button>
