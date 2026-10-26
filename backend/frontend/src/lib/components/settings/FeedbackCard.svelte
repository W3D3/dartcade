<script lang="ts">
  // Settings' Profile: the way into the bug report dialog besides the Alpha badge. Hidden when the server takes no reports.
  import { Bug } from '@lucide/svelte'
  import { authInfo } from '$lib/authInfo'
  import { openFeedback } from '$lib/feedback/report'
</script>

{#if $authInfo.feedback}
  <section aria-labelledby="feedback-title" class="box-border p-4 md:p-[22px] card flex flex-col gap-[14px]">
    <div class="flex flex-col gap-1">
      <h2 id="feedback-title" class="m-0 text-[17px] font-semibold">Report a bug</h2>
      <p class="m-0 text-[13px] leading-[1.5] text-text-dim">
        Dartcade is in alpha. Something broken, or an idea? Tell us, with a screenshot of the page if you like.
      </p>
    </div>
    <button
      type="button"
      onclick={() => void openFeedback()}
      class="self-start h-11 px-4 flex items-center gap-2 rounded-[10px] border border-line-3 bg-transparent text-text
             text-[14px] font-semibold cursor-pointer font-[inherit] transition-colors hover:bg-surface-active"
    >
      <Bug size={16} />Report a bug or give feedback
    </button>
  </section>
{/if}
