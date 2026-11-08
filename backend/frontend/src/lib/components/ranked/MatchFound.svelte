<script lang="ts">
  // The match-found prompt (MM-Found, MM-Found-Duo, MM-Found-Phone boards), on whatever screen you
  // are: everyone has 10 s to accept, the other side stays hidden until all did. Once everyone
  // accepted the game starts, and the server's matchmaking.ended takes you to it.
  import { onDestroy } from 'svelte'
  import { push } from 'svelte-spa-router'
  import { Check, Lock, Swords } from '@lucide/svelte'
  import { Modal } from '$lib/components/ui/modal/index.js'
  import Avatar from '$lib/components/Avatar.svelte'
  import ErrorText from '$lib/components/ErrorText.svelte'
  import { me } from '$lib/lobby/sockets'
  import { acceptMatch, acceptedLine, declineMatch, clock, endedNotice, formatLine, secondsLeft, youAccepted } from '$lib/ranked/queue'
  import { signedRp } from '$lib/ranked/view'

  /** How long the note about a match that fell through stays. */
  const NOTICE_MS = 8_000

  let tick = $state(Date.now())
  const ticker = setInterval(() => (tick = Date.now()), 250)
  onDestroy(() => clearInterval(ticker))

  const matchmakingEnded = me.matchmakingEnded
  const match = $derived($me?.matchmaking?.match ?? null)
  const left = $derived(match ? secondsLeft(match, tick) : 0)
  const accepted = $derived(match ? youAccepted(match) : false)
  const count = $derived(match ? acceptedLine(match) : null)
  const duo = $derived(match?.mode === '2v2')
  let busy = $state(false)
  let error = $state('')

  // The server says how a match ended (matchmaking.ended): the game started, which opens it, or it
  // fell through, which says so for a few seconds
  let notice = $state<string | null>(null)
  let handled: unknown = null
  let noticeTimer: ReturnType<typeof setTimeout> | undefined
  onDestroy(() => clearTimeout(noticeTimer))
  $effect(() => {
    const ended = $matchmakingEnded
    if (!ended || ended === handled) return
    handled = ended
    if (ended.reason === 'started' && ended.sessionId) {
      void push(`/session/${ended.sessionId}`)
      return
    }
    notice = endedNotice(ended)
    clearTimeout(noticeTimer)
    noticeTimer = setTimeout(() => (notice = null), NOTICE_MS)
  })

  async function accept() {
    if (!match) return
    busy = true
    error = (await acceptMatch(match.id)) ?? ''
    busy = false
  }

  async function decline() {
    if (!match) return
    busy = true
    error = (await declineMatch(match.id)) ?? ''
    busy = false
  }
</script>

{#if match}
  <Modal onclose={() => {}} showClose={false} widthClass="max-w-[640px]" zClass="z-[60]">
    <div class="flex flex-col items-center gap-[6px] text-center">
      <span class="inline-flex items-center gap-2 text-[13px] font-bold uppercase tracking-[0.12em] text-accent"
        ><Swords size={16} />Ranked {match.mode}</span
      >
      <h2 class="font-display text-[40px] font-bold uppercase leading-none tracking-title md:text-[52px]">Match found</h2>
      <span class="text-[13px] text-text-muted md:text-[14px]">{formatLine(match.firstTo)} · bull-off decides who starts</span>
      {#if count}<span class="text-[13px] font-semibold text-ink-2">{count}</span>{/if}
    </div>

    <div class="flex items-stretch gap-3 md:gap-[14px]">
      <div class="flex min-w-0 flex-1 flex-col gap-2">
        {#each match.yours as seat, i (i)}
          <div
            class="box-border flex flex-1 flex-col items-center justify-center gap-2 rounded-card border border-line-2 bg-surface-1 px-3 py-4"
          >
            <Avatar name={seat.person?.name ?? ''} face={seat.person} size={duo ? 44 : 64} tone={seat.you ? 'accent' : 'default'} />
            <span class="max-w-full truncate text-[17px] font-semibold md:text-[20px]"
              >{seat.person?.name}{#if seat.you}<span class="text-[13px] font-medium text-accent">&nbsp;· you</span>{/if}</span
            >
            <span class="text-[12px] {seat.accepted ? 'text-accent' : 'text-text-dim'}"
              >{seat.accepted ? 'Accepted' : seat.you ? 'Your call' : 'Waiting'}</span
            >
          </div>
        {/each}
      </div>
      <span class="self-center font-display text-[24px] font-bold text-line-strong md:text-[30px]">VS</span>
      <div class="flex min-w-0 flex-1 flex-col gap-2">
        {#each match.theirs as seat, i (i)}
          <div
            class="box-border flex flex-1 flex-col items-center justify-center gap-2 rounded-card border border-dashed border-line-chip bg-surface-1 px-3 py-4"
          >
            <span
              aria-hidden="true"
              class="box-border flex shrink-0 items-center justify-center rounded-full border-[1.5px] border-dashed border-line-strong font-display font-bold text-text-dim {duo
                ? 'size-11  text-[22px]'
                : 'size-16  text-[32px]'}">?</span
            >
            <span class="text-[17px] font-semibold text-ink-2 md:text-[20px]">{duo ? `Opponent ${i + 1}` : 'Opponent'}</span>
            {#if duo}
              <span class="text-[12px] {seat.accepted ? 'text-accent' : 'text-text-dim'}">{seat.accepted ? 'Accepted' : 'Waiting'}</span>
            {/if}
          </div>
        {/each}
      </div>
    </div>

    <div class="flex flex-col items-center gap-2 text-center">
      <span
        class="inline-flex h-[25px] items-center gap-[6px] whitespace-nowrap rounded-chip border border-line-chip bg-surface-inset px-[9px] font-mono text-[12px] text-text-muted"
        ><Lock size={13} />Within ±{match.range} RP of {duo ? 'your duo' : 'you'}</span
      >
      <span class="text-[13px] text-text-dim"
        >{duo ? 'Opponents are revealed when everyone accepts.' : 'Revealed once you both accept.'}</span
      >
      {#if match.stakes}
        <span class="text-[15px] text-text-muted"
          >Win <strong class="font-mono font-medium text-accent">{signedRp(match.stakes.win)}</strong> · Loss
          <strong class="font-mono font-medium text-live-text">{signedRp(-match.stakes.loss)}</strong> RP</span
        >
      {:else}
        <span class="text-[14px] text-text-muted">A placement match: your rating stays hidden until you're placed.</span>
      {/if}
    </div>

    <div class="flex flex-col gap-[10px]">
      <div class="grid grid-cols-[1fr_2fr] gap-3">
        <button
          type="button"
          disabled={busy}
          onclick={decline}
          class="flex h-[60px] cursor-pointer items-center justify-center rounded-card border border-line-strong text-[16px] font-semibold text-text"
          >Decline</button
        >
        {#if accepted}
          <span
            role="status"
            class="flex h-[60px] items-center justify-center gap-2 rounded-card border border-accent-line-strong bg-surface-paused text-[15px] font-semibold text-text"
            ><Check size={18} class="text-accent" />Waiting<span class="hidden md:inline">&nbsp;for the others</span> ·
            <span class="font-mono">{clock(left)}</span></span
          >
        {:else}
          <button
            type="button"
            disabled={busy}
            onclick={accept}
            class="relative flex h-[60px] cursor-pointer items-center justify-center gap-3 overflow-hidden rounded-card border-0 bg-accent font-display text-[26px] font-bold uppercase tracking-wordmark text-accent-fg"
          >
            Accept<span role="timer" aria-label="Seconds left to accept" class="font-mono text-[16px] font-medium tracking-normal"
              >{clock(left)}</span
            >
            <span aria-hidden="true" class="absolute inset-x-0 bottom-0 h-[5px] bg-accent-fg/25"
              ><span
                class="block h-full origin-left bg-accent-fg transition-transform duration-300 ease-linear"
                style:transform="scaleX({Math.min(1, left / match.acceptSeconds)})"
              ></span></span
            >
          </button>
        {/if}
      </div>
      {#if error}<ErrorText>{error}</ErrorText>{/if}
      <span class="text-center text-[13px] text-text-dim">
        {#if duo}
          If anyone declines or runs out of time, the match is dropped and the others go back to the queue. Whoever declined pauses for 2
          minutes.
        {:else}
          Declining or letting the timer run out pauses your queue for 2 minutes.
        {/if}
      </span>
    </div>
  </Modal>
{/if}

{#if notice}
  <div
    role="status"
    aria-live="polite"
    class="fixed top-20 left-1/2 z-60 box-border w-[min(480px,calc(100vw-32px))] -translate-x-1/2 rounded-card border border-line-popover bg-surface-inset px-[18px] py-[14px] text-[15px] font-medium text-text [box-shadow:0_24px_60px_rgba(0,0,0,0.6)]"
  >
    {notice}
  </div>
{/if}
