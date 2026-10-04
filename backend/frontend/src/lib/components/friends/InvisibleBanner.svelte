<script lang="ts">
  // Friends page, phones included: shown while Invisible (User-Badge / Friends boards).
  let { ongoonline }: { ongoonline: () => void } = $props()
</script>

<div role="status" class="flex items-center gap-3 px-4 py-3 rounded-[12px] bg-surface-row border border-line-2 text-[14px] text-ink-2">
  <span class="w-[10px] h-[10px] box-border rounded-full border-2 border-text-dim shrink-0" aria-hidden="true"></span>
  <span><strong class="text-text">You're invisible.</strong> Friends see you as offline.
    <button type="button" onclick={ongoonline} class="p-0 bg-transparent border-0 text-accent font-semibold cursor-pointer font-[inherit]">Go online</button></span>
</div>
