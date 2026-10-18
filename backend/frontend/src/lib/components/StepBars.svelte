<script lang="ts">
  // Two-step progress bars for the auth flow: Register (step 1) and Verify (step 2), both filled
  // once a step is reached (see project/Register-Verify.dc.html — step 2 shows both bars lit).
  let { step, label }: { step: 1 | 2; label: string } = $props()
</script>

<div class="flex items-center gap-[10px]">
  <span class="block w-9 h-1 rounded-full bg-accent"></span>
  <span class="block w-9 h-1 rounded-full {step === 2 ? 'bg-accent' : 'bg-line-3'}"></span>
  <span class="text-[13px] text-text-muted ml-[6px]">Step {step} of 2 · {label}</span>
</div>
