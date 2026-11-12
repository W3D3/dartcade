<script lang="ts">
  // The buttons under an in-person participants list: Add player (or team), Paste a list, Import
  // CSV. A paste or an import is parsed by parseList; `onlines` adds it and says what it added.
  import { ClipboardList, FileUp, Plus } from '@lucide/svelte'
  import { Button } from '$lib/components/ui/button/index.js'
  import { Modal } from '$lib/components/ui/modal/index.js'
  import { parseList, type ParsedLine } from '$lib/tournaments/participants'

  let {
    teams,
    full,
    onaddone,
    onlines,
    csv = true,
  }: {
    teams: boolean
    /** The list holds the most it may: nothing more can be added. */
    full: boolean
    /** Adds one empty row; left out where the list has its own Add button. */
    onaddone?: () => void
    /** Adds the parsed lines; the line telling what was added. */
    onlines: (lines: ParsedLine[]) => string
    csv?: boolean
  } = $props()

  let pasting = $state(false)
  let text = $state('')
  let note = $state('')
  let file = $state<HTMLInputElement>()

  function add(source: string) {
    const lines = parseList(source, teams)
    note = lines.length > 0 ? onlines(lines) : 'No names found.'
  }

  async function imported(e: Event & { currentTarget: HTMLInputElement }) {
    const f = e.currentTarget.files?.[0]
    e.currentTarget.value = ''
    if (f) add(await f.text())
  }
</script>

<div class="flex flex-col gap-2">
  <div class="flex flex-wrap gap-2">
    {#if onaddone}
      <Button variant="outline" size="sm" disabled={full} onclick={onaddone}><Plus size={16} />{teams ? 'Add team' : 'Add player'}</Button>
    {/if}
    <Button variant="outline" size="sm" disabled={full} onclick={() => ((pasting = true), (note = ''))}
      ><ClipboardList size={16} />Paste a list</Button
    >
    {#if csv}
      <Button variant="outline" size="sm" disabled={full} onclick={() => file?.click()}><FileUp size={16} />Import CSV</Button>
      <input bind:this={file} type="file" accept=".csv,.txt,text/csv,text/plain" class="sr-only" tabindex="-1" onchange={imported} />
    {/if}
  </div>
  {#if note}<span class="text-caption text-text-muted" role="status">{note}</span>{/if}
</div>

{#if pasting}
  <Modal title="Paste a list" onclose={() => (pasting = false)} widthClass="md:max-w-lg">
    <label class="flex flex-col gap-2">
      <span class="text-label text-text-muted">
        {teams ? 'One team per line: the team, then its players, separated by semicolons.' : 'One name per line.'}
      </span>
      <textarea
        bind:value={text}
        rows="8"
        placeholder={teams ? 'Treble Trouble; Anna; Jonas\nOche Owls; Mia; Paul' : 'Anna Berger\nJonas\nMia K.'}
        class="resize-y rounded-md border border-line-3 bg-surface-2 px-4 py-3 font-mono text-label text-text
               focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"></textarea>
    </label>
    {#snippet footer()}
      <Button variant="ghost" onclick={() => (pasting = false)}>Cancel</Button>
      <Button
        variant="accent"
        disabled={!text.trim()}
        onclick={() => {
          add(text)
          text = ''
          pasting = false
        }}>Add to the list</Button
      >
    {/snippet}
  </Modal>
{/if}
