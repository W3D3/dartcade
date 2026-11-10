<script lang="ts">
  // What a ranked game says over the board: the thrower's Turn chip for the last seconds of a
  // visit, the red reserve banner once the visit ran over, and (when the game is not already
  // waiting for them) an opponent who lost their connection and forfeits if they stay away.
  // Nothing at all while there is time.
  import ReconnectBanner from './ReconnectBanner.svelte'
  import ReserveBanner from './ReserveBanner.svelte'
  import TimerChips from './TimerChips.svelte'
  import { tick } from '$lib/now'
  import { reconnectView } from '$lib/ranked/clock'
  import { disconnected, upClock, type RankedState } from '$lib/ranked/inGame'

  let {
    ranked,
    skew,
    mySeats,
    names,
    up,
    waiting = false,
  }: {
    ranked: RankedState
    /** The server's clock minus this one (`clockSkew`). */
    skew: number
    mySeats: readonly number[]
    /** Each seat's name, in seat order. */
    names: readonly string[]
    /** The seat that is up. */
    up: number
    /** The game already shows its waiting card for the seat that is up. */
    waiting?: boolean
  } = $props()

  const clock = $derived(upClock(ranked, skew, $tick))
  // Whose clock it is: nobody's name when it is yours
  const thrower = $derived(mySeats.includes(up) ? null : (names[up] ?? null))
  const away = $derived(waiting ? null : disconnected(ranked, mySeats, skew))
</script>

{#if away}
  {@const left = reconnectView(away.forfeitAt, $tick)}
  <ReconnectBanner name={names[away.seat]} left={left.left} drain={left.drain} />
{/if}
{#if clock.phase === 'reserve'}
  <ReserveBanner left={clock.reserve} drain={clock.drain} name={thrower} />
{:else if clock.phase === 'visit'}
  <div class="flex items-center justify-center gap-2 text-[13px] text-text-muted">
    {#if thrower}<span class="truncate">{thrower}</span>{/if}<TimerChips view={clock} />
  </div>
{/if}
