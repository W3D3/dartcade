<script lang="ts">
  // Settings' Profile: the way into the bug report dialog besides the Alpha badge. Hidden when the server takes no reports.
  import SettingsCard from '$lib/components/settings/SettingsCard.svelte'
  import { Bug } from '@lucide/svelte'
  import { authInfo } from '$lib/authInfo'
  import { openFeedback } from '$lib/feedback/report'
</script>

{#if $authInfo.feedback}
  <SettingsCard
    id="feedback-title"
    title="Report a bug"
    description="Dartcade is in alpha. Something broken, or an idea? Tell us, with a screenshot of the page if you like."
  >
    <button
      type="button"
      onclick={() => void openFeedback()}
      class="self-start h-11 px-4 flex items-center gap-2 rounded-[10px] border border-line-3 bg-transparent text-text
             text-[14px] font-semibold cursor-pointer font-[inherit] transition-colors hover:bg-surface-active"
    >
      <Bug size={16} />Report a bug or give feedback
    </button>
  </SettingsCard>
{/if}
