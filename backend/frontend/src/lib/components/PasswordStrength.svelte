<script lang="ts">
  // Strength meter under a new-password field, shared by Register and Reset.
  let { password }: { password: string } = $props()

  let strength = $derived.by(() => {
    if (!password) return 0
    let s = 0
    if (password.length >= 8) s++
    if (password.length >= 12) s++
    if (/[A-Z]/.test(password) && /[a-z]/.test(password)) s++
    if (/[0-9]/.test(password) || /[^a-zA-Z0-9]/.test(password)) s++
    return s
  })

  const strengthLabels = ['', 'Weak', 'Fair', 'Good', 'Strong']
  const strengthColors = ['', '#ff5a4f', '#f59e0b', '#84cc16', '#c6f24e']
</script>

{#if password}
  <div class="flex gap-1 mt-1">
    {#each [1, 2, 3, 4] as lvl (lvl)}
      <div
        class="h-1 flex-1 rounded-full transition-colors"
        style:background={lvl <= strength ? strengthColors[strength] : 'var(--color-line-2)'}
      ></div>
    {/each}
  </div>
  <p class="m-0 text-[13px]" style:color={strengthColors[strength]}>
    {strengthLabels[strength]}
  </p>
{/if}
