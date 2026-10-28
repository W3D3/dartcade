<script lang="ts">
  // The held result: the match screen's win screen (121: its session summary), view only, then the countdown to the idle screen.
  // Lives in the frame, like Live.
  import { tick } from 'svelte'
  import P121Summary from '$lib/components/p121/P121Summary.svelte'
  import WinScreen from '$lib/components/WinScreen.svelte'
  import type { GameDetail } from '$lib/api'
  import { currentUser } from '$lib/auth'
  import { flag } from '$lib/flags'
  import { getGameView } from '$lib/gameViews'
  import { snapshotStandings } from '$lib/p121/summary'
  import { sharedBoard, winMeta, winView } from '$lib/winScreen'
  import type { Snapshot } from '$lib/ws'
  import BigHeader from './BigHeader.svelte'
  import type { BoardState } from '$lib/bigscreen/frame'
  import GenericResult from './GenericResult.svelte'

  let { snapshot, detail, countdown, board }: { snapshot: Snapshot; detail: GameDetail | null; countdown: string; board: BoardState } =
    $props()

  const progression = flag('progression.enabled')
  const view = $derived(getGameView(snapshot.gameId))
  const win = $derived(winView(snapshot, detail))
  const p121 = $derived(snapshot.gameId === 'p121' ? snapshot.game : null)
  // The winner's own celebration plays when someone is signed in here (the owner's preview); a kiosk has no session
  // to read profiles with, and never shows anyone's XP (xpSessionId stays null)
  const winnerId = $derived(
    $progression && $currentUser && win ? (snapshot.seats[win.competitors[0]?.seats[0] ?? -1]?.userId ?? null) : null,
  )

  // Nobody can scroll a kiosk: scale what the result shows down until it fits. It is measured again when the
  // saved game arrives (not on every post of the same result), when fonts load and when the frame resizes
  let box = $state<HTMLDivElement>()
  let fit = $state(1)
  const shown = $derived(`${snapshot.sessionId}:${detail?.game.id ?? ''}`)
  function measure() {
    fit = 1
    void tick().then(() => {
      if (!box) return
      let over = 0
      for (const el of box.querySelectorAll('*')) {
        if (['auto', 'scroll'].includes(getComputedStyle(el).overflowY)) over = Math.max(over, el.scrollHeight - el.clientHeight)
      }
      fit = Math.min(1, box.clientHeight / (box.clientHeight + over))
    })
  }
  $effect(() => {
    if (shown.length === 0) return
    measure()
    void document.fonts.ready.then(measure)
  })
</script>

<svelte:window onresize={measure} />

{#if win || p121}
  {#if p121}<BigHeader title={view.title} meta={winMeta(snapshot)} board={sharedBoard(snapshot)} bm={board} final />{/if}
  <div bind:this={box} class="min-h-0 flex-1 overflow-hidden">
    <div class="flex origin-top-left flex-col" style="width:{100 / fit}%;height:{100 / fit}%;transform:scale({fit})">
      {#if win}
        <WinScreen
          view={win}
          title={view.title}
          meta={winMeta(snapshot)}
          lobbyName={snapshot.lobbyName}
          board={sharedBoard(snapshot)}
          saved={false}
          {winnerId}
        />
      {:else if p121}
        <P121Summary
          detail={detail?.detail.mode === 'p121' ? detail.detail : null}
          players={snapshot.players}
          seat={0}
          missRule={p121.cfg.missRule}
          startTarget={p121.cfg.startTarget}
          standings={snapshotStandings(p121, snapshot.players, snapshot.results)}
        />
      {/if}
    </div>
  </div>
  <div class="flex h-[58px] flex-none items-center justify-center font-mono text-[24px] text-text-dim">{countdown}</div>
{:else}
  <GenericResult {snapshot} {countdown} />
{/if}
