<script lang="ts">
  // Solo: the lobby page leads with this instead of the people list and history - the code,
  // the link, the QR code and the add field, so playing alone stays one tap from playing with
  // friends.
  import type { Lobby } from '$lib/api/lobby-ws'
  import AddSomeone from './AddSomeone.svelte'
  import JoinCodeCard from './JoinCodeCard.svelte'

  let { lobby, exclude, onnewcode, onguest, oninvite }: {
    lobby: Lobby
    /** Accounts the add field doesn't suggest: already in the lobby, or invited. */
    exclude: string[]
    onnewcode: () => void
    onguest: (name: string) => Promise<boolean>
    oninvite: (userId: string) => Promise<boolean>
  } = $props()
</script>

<section aria-label="Invite friends"
  class="flex flex-col gap-[14px] md:gap-[18px] p-4 md:p-5 rounded-[14px] bg-surface-panel border border-line-2">
  <h2 class="m-0 text-[15px] md:text-[17px] font-semibold">Invite friends</h2>
  <JoinCodeCard code={lobby.code} name={lobby.name} host {onnewcode} />
  <AddSomeone {exclude} {onguest} {oninvite} />
</section>
