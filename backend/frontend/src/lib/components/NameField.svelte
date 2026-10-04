<script lang="ts">
  // A name (handle) input that checks the rules while typing and availability after a pause.
  // Used on sign-up, in Settings and on Pick your name.
  import { onDestroy } from 'svelte'
  import { Input } from '$lib/components/ui/input/index.js'
  import NameStatusLine from './NameStatusLine.svelte'
  import { createNameCheck, lookupName, type NameStatus } from '$lib/names'

  let { id, label, value = $bindable(''), own = null, status = $bindable({ kind: 'empty' }) }: {
    id: string
    label: string
    value?: string
    /** Your current name: free for you without asking. */
    own?: string | null
    status?: NameStatus
  } = $props()

  const check = createNameCheck(lookupName, () => own)
  const unsub = check.status.subscribe(s => { status = s })
  $effect(() => { check.check(value) })
  onDestroy(() => { unsub(); check.stop() })

  const statusId = $derived(`${id}-status`)
</script>

<div class="flex flex-col gap-2">
  <label for={id} class="text-[14px] font-medium text-ink-soft">{label}</label>
  <div class="flex items-center gap-2 min-w-0">
    <span aria-hidden="true" class="font-mono text-text-dim">@</span>
    <Input {id} bind:value aria-describedby={statusId} autocomplete="username" autocapitalize="off" spellcheck="false" maxlength={64} class="flex-grow min-w-0" />
  </div>
  <NameStatusLine id={statusId} {status} />
</div>
