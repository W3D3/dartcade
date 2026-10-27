<script lang="ts">
  // The THROWING / NEXT / OUT pill of a seat; `text` replaces its word (BULL OFF, TRY 3 OF 10, WINNER).
  let { kind, text }: { kind: 'throwing' | 'next' | 'out' | null; text?: string } = $props()
  const look = {
    throwing: 'bg-accent text-accent-fg',
    next: 'border-2 border-line-chip text-text-muted',
    out: 'border-2 border-line-chip text-text-dim',
  }
  const word = { throwing: 'THROWING', next: 'NEXT', out: 'OUT' }
</script>

{#if kind}
  <span class="inline-flex h-[46px] items-center rounded-full px-5 text-[26px] font-extrabold tracking-[0.14em] {look[kind]}"
    >{text ?? word[kind]}</span
  >
{/if}
