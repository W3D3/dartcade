<script lang="ts">
  // Boards with none paired yet (Settings-Boards-Empty board): why connect one, how to pair, and
  // the pairing code field. Pair carries the code into the pairing dialog, which names the board.
  import { Calculator, ChartColumn, Swords, Target, Users } from '@lucide/svelte'
  import { Input } from '$lib/components/ui/input/index.js'
  import { flag } from '$lib/flags'
  import { extractPairingCode, formatPairingCode, normalizePairingCode } from '$lib/pairing'

  let { onpair }: { onpair: (code: string) => void } = $props()

  /** How to install the bridge, until the app has a download page of its own. */
  const BRIDGE_DOWNLOAD_URL = 'https://github.com/W3D3/dartcade/blob/main/GETTING_STARTED.md#2-install-the-bridge'

  const matchmaking = flag('matchmaking.enabled')
  const benefits = $derived([
    {
      icon: Target,
      title: 'Every dart scores itself',
      text: 'Autodarts cameras detect each dart. No typing, no maths, corrections in one tap.',
    },
    { icon: Users, title: 'Play friends on their own boards', text: 'Lobbies span boards: one match, each of you at home.' },
    ...($matchmaking
      ? [{ icon: Swords, title: 'Ranked matchmaking', text: 'Get a rating and get matched with players at your level.' }]
      : []),
    { icon: ChartColumn, title: 'Stats from every dart', text: 'Averages, checkout rate and heatmaps build up on their own.' },
  ])
  const steps = [
    { title: 'Pick your system', text: 'Linux, macOS or Windows, on the computer that runs your Autodarts Board Manager.' },
    { title: 'Run one command', text: 'It installs the Dartcade bridge and signs it in to your account. No code to type.' },
    { title: 'Name your board', text: 'It shows up here as soon as the bridge connects.' },
  ]

  let code = $state('')
</script>

<div class="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_460px] gap-4 md:gap-5 items-start">
  <section
    aria-label="Why connect a board"
    class="box-border p-5 md:p-7 card border-accent-line bg-linear-160 from-accent-tint/60 to-surface-panel to-60% flex flex-col gap-[22px]"
  >
    <div class="flex flex-col gap-2">
      <span class="text-[12px] font-bold label-caps tracking-[0.12em] text-accent">No board yet</span>
      <h2 class="m-0 font-display font-bold text-[34px] md:text-[44px] leading-[0.95] uppercase">Connect your first board</h2>
      <p class="m-0 text-[15px] leading-[1.5] text-ink-2">
        Dartcade works with Autodarts. Pair your board once and it's ready on every device you sign in on.
      </p>
    </div>
    <ul class="m-0 p-0 list-none flex flex-col gap-[18px]">
      {#each benefits as b (b.title)}
        <li class="flex gap-[14px]">
          <span
            class="w-10 h-10 shrink-0 flex items-center justify-center rounded-[10px] bg-surface-active border border-line-2 text-accent"
          >
            <b.icon size={20} strokeWidth={1.8} />
          </span>
          <span class="flex flex-col gap-[3px]">
            <strong class="text-[16px] font-semibold">{b.title}</strong>
            <span class="text-[14px] leading-[1.45] text-text-muted">{b.text}</span>
          </span>
        </li>
      {/each}
    </ul>
  </section>

  <section aria-labelledby="pair-a-board" class="box-border p-5 md:p-[26px] card flex flex-col gap-[18px]">
    <h2 id="pair-a-board" class="m-0 font-display font-bold text-[28px] leading-none uppercase">Pair a board</h2>
    <ol class="m-0 p-0 list-none flex flex-col gap-[14px]">
      {#each steps as step, i (step.title)}
        <li class="flex gap-3 items-start">
          <span
            class="w-[26px] h-[26px] shrink-0 flex items-center justify-center rounded-full bg-accent-tint text-accent text-[13px] font-bold"
            >{i + 1}</span
          >
          <span class="flex flex-col gap-[2px]">
            <strong class="text-[15px] font-semibold">{step.title}</strong>
            <span class="text-[13px] leading-[1.45] text-text-muted">{step.text}</span>
          </span>
        </li>
      {/each}
    </ol>
    <button
      type="button"
      onclick={() => onpair('')}
      class="h-[52px] px-[22px] self-start rounded-[10px] border-0 bg-accent text-accent-fg font-display font-bold text-[20px]
             tracking-[0.06em] uppercase cursor-pointer transition-colors hover:bg-accent-hover">Set up a board</button
    >
    <a href={BRIDGE_DOWNLOAD_URL} target="_blank" rel="noopener noreferrer" class="self-start text-[14px] font-semibold no-underline"
      >More install options ›</a
    >
    <form
      class="flex flex-col gap-2"
      onsubmit={e => {
        e.preventDefault()
        onpair(normalizePairingCode(code))
      }}
    >
      <label for="empty-pair-code" class="text-[14px] font-semibold">Already have a pairing code?</label>
      <div class="flex gap-2">
        <Input
          id="empty-pair-code"
          bind:value={code}
          oninput={() => (code = formatPairingCode(code))}
          onpaste={(e: ClipboardEvent) => {
            // A whole log line works too
            const found = extractPairingCode(e.clipboardData?.getData('text') ?? '')
            if (!found) return
            e.preventDefault()
            code = formatPairingCode(found)
          }}
          placeholder="XXXX-XXXX"
          autocomplete="off"
          autocapitalize="characters"
          spellcheck="false"
          class="flex-grow min-w-0 h-[52px] font-mono text-[18px] tracking-[0.12em]"
        />
        <button
          type="submit"
          class="h-[52px] px-[22px] shrink-0 rounded-[10px] border-0 bg-accent text-accent-fg font-display font-bold text-[20px]
                 tracking-[0.06em] uppercase cursor-pointer transition-colors hover:bg-accent-hover">Pair</button
        >
      </div>
    </form>
    <p class="m-0 flex gap-[10px] px-[14px] py-3 rounded-[12px] bg-surface-1 border border-line text-[13px] leading-[1.5] text-text-muted">
      <Calculator size={16} class="shrink-0 mt-[2px]" />
      <span
        ><strong class="text-text font-semibold">No Autodarts board?</strong> You can still play every game by typing your scores on the keypad.</span
      >
    </p>
  </section>
</div>
