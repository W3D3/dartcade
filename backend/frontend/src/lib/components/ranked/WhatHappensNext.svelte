<script lang="ts">
  // The list under a duo's search in its lobby (MM-Lobby-Host board).
  import { ACCEPT_SECONDS } from '$shared/ranked.js'

  const steps = [
    { title: 'Match found', text: `You both get ${ACCEPT_SECONDS} s to accept, on whatever screen you're on.` },
    { title: 'All four accept', text: 'Bull-off on your own boards, then the game starts.' },
    { title: 'Someone declines', text: 'The match is dropped. You go back to the queue and keep your place.' },
  ]
</script>

<section class="box-border flex flex-col gap-3 rounded-[16px] border border-line bg-surface-panel px-5 py-4" aria-label="What happens next">
  <h3 class="m-0 text-[16px] font-semibold">What happens next</h3>
  <ol class="m-0 flex list-none flex-col gap-3 p-0">
    {#each steps as step, i (step.title)}
      <li class="flex items-start gap-3">
        <span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-line-strong text-[12px] text-text-muted"
          >{i + 1}</span
        >
        <span class="flex flex-col gap-[2px]">
          <span class="text-[14px] font-semibold">{step.title}</span>
          <span class="text-[13px] text-text-muted">{step.text}</span>
        </span>
      </li>
    {/each}
  </ol>
</section>
