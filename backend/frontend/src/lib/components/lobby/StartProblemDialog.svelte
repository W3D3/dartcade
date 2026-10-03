<script lang="ts">
  // A start was refused: the dialog's kind comes straight from the server's code (no client
  // rules). board_offline and not_ready are skippable (Start anyway); anything else just
  // sends you back.
  import ConfirmModal from '$lib/components/ConfirmModal.svelte'
  import { Modal } from '$lib/components/ui/modal/index.js'
  import { describeConflict } from '$lib/lobby/input'
  import type { StartOutcome } from '$lib/lobby/start'

  type Problem = Extract<StartOutcome, { kind: 'problem' }>

  let { problem, onstartanyway, onback }: {
    problem: Problem
    onstartanyway: () => void
    onback: () => void
  } = $props()

  function offlineBody(names: string[]): string {
    const list = names.join(', ')
    return names.length === 1
      ? `${list} is offline. Its players enter darts by manual entry until it's back.`
      : `${list} are offline. Their players enter darts by manual entry until they're back.`
  }

  // active_session only carries a sessionId when it's your own running game (the server's
  // text names the other player otherwise) — that's when there's a game to return to.
  const returnSessionId = $derived(
    problem.code === 'other' && problem.refusal.code === 'active_session' ? problem.refusal.sessionId ?? null : null,
  )
</script>

{#if problem.code === 'board_offline'}
  <ConfirmModal title="Board offline" body={offlineBody(problem.offlineBoards)}
    confirmLabel="Start anyway" cancelLabel="Back to lobby" onconfirm={onstartanyway} oncancel={onback} />
{:else if problem.code === 'not_ready'}
  <ConfirmModal title="Start anyway?" body={`Not ready yet: ${problem.notReady.join(', ')}.`}
    confirmLabel="Start anyway" cancelLabel="Back to lobby" onconfirm={onstartanyway} oncancel={onback} />
{:else if problem.code === 'other'}
  <Modal title="Can't start yet" subtitle={describeConflict(problem.refusal)} onclose={onback}
    showClose={false} dismissOnBackdrop={true} widthClass="max-w-[380px]" zClass="z-[200]">
    {#snippet footer()}
      <button type="button" onclick={onback}
        class="flex-1 h-12 rounded-[10px] border border-line-3 bg-transparent text-text
               text-[15px] font-medium cursor-pointer">
        Back to lobby
      </button>
      {#if returnSessionId}
        <a href="#/session/{returnSessionId}"
          class="flex-1 h-12 rounded-[10px] border-0 bg-accent text-accent-fg text-[15px] font-bold
                 cursor-pointer flex items-center justify-center no-underline">
          Return to game
        </a>
      {/if}
    {/snippet}
  </Modal>
{/if}
