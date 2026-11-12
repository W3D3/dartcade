<script lang="ts">
  // A tournament's Details opened from a list that is not Browse (My tournaments, Up next for
  // you): loads it, and runs Register, Check in, Withdraw and Start now like Browse does.
  import type { Tournament } from '$lib/api'
  import { checkIn, loadTournament, register, startNow, withdraw, type Outcome } from '$lib/tournaments/browse'
  import TournamentDetail from './TournamentDetail.svelte'

  // `onchange`: the tournament moved (the list behind it should load again)
  // `onfail`: it could not be loaded (gone, or not yours to see), with the words to say so
  let { id, onclose, onfail, onchange }: { id: string; onclose: () => void; onfail: (message: string) => void; onchange: () => void } =
    $props()

  let t = $state<Tournament | null>(null)
  let busy = $state(false)
  let error = $state('')

  $effect(() => {
    void loadTournament(id).then(res => {
      if ('error' in res) {
        onfail(res.error)
      } else t = res.tournament
    })
  })

  async function act(call: () => Promise<Outcome>) {
    busy = true
    try {
      const res = await call()
      if ('error' in res) error = res.error
      else [t, error] = [res.tournament, '']
      onchange()
    } finally {
      busy = false
    }
  }
</script>

{#if t}
  {@const open = t}
  <TournamentDetail
    t={open}
    {busy}
    {error}
    {onclose}
    onregister={() => act(() => register(open.id))}
    onwithdraw={() => act(() => withdraw(open.id))}
    oncheckin={() => act(() => checkIn(open.id))}
    onstart={() => act(() => startNow(open.id))}
  />
{/if}
