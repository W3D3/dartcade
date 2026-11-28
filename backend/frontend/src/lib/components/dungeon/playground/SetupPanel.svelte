<!-- Setup: the party, the enemies, the rules and the seed, plus presets. Everything here edits the setup; the log re-runs against it. -->
<script lang="ts">
  import type { Playground } from '$lib/dungeon/playground/store.svelte'
  import { isClassId, modifiersOf } from '$shared/dungeon/content/classes.js'
  import { DIFFICULTIES, DUNGEON_RULES, FLOOR_COUNTS } from '$shared/dungeon/rules.js'
  import { isEnemyId } from '$shared/dungeon/content/enemies.js'
  import { intentOf } from '$shared/dungeon/enemyTurn.js'
  import { newEnemy, newHero } from '$lib/dungeon/playground/setup'
  import { exportPreset, importPreset, loadPresets, savePresets, SCENARIOS, type Preset } from '$lib/dungeon/playground/presets'
  import { BTN, BTN_SM, CARD, FIELD, H2 } from '$lib/dungeon/playground/ui'
  import ArtifactIcon from '../ArtifactIcon.svelte'
  import { isArtifactId } from '$shared/dungeon/content/artifacts.js'
  import { CLASS_COLOR } from '$lib/dungeon/view'
  import { SPRITES } from '$lib/dungeon/sprites'
  import HpRow from './HpRow.svelte'
  import Sprite from './Sprite.svelte'
  import ContentPicker from './ContentPicker.svelte'

  let { pg }: { pg: Playground } = $props()

  let saved = $state<Preset[]>(loadPresets())
  let presetName = $state('')
  let notice = $state('')
  let addEnemy = $state('')
  let pickedPreset = $state('scenario:0')

  const s = $derived(pg.setup)
  const cat = $derived(pg.catalogue)
  const enemyRows = $derived(Object.entries(cat.enemies).flatMap(([id, e]) => (e ? [{ id, name: e.name }] : [])))
  const classRows = $derived(Object.entries(cat.classes).flatMap(([id, e]) => (e ? [{ id, name: e.name }] : [])))
  const itemsOn = (n: number) => s.items.filter(i => i.number === n).length

  function loadPreset() {
    const [kind, i] = pickedPreset.split(':')
    if (kind === 'scenario') pg.load(SCENARIOS[Number(i)].setup, SCENARIOS[Number(i)].script)
    else if (saved[Number(i)]) pg.load(saved[Number(i)].setup)
    notice = ''
  }
  function savePreset() {
    const name = presetName.trim()
    if (!name) return void (notice = 'Name the preset first')
    saved = [...saved.filter(p => p.name !== name), { name, setup: $state.snapshot(s) }]
    notice = savePresets(saved) ? `Saved "${name}" in this browser` : 'This browser would not store it (private window?)'
  }
  function download() {
    const name = presetName.trim() || 'dungeon-setup'
    const url = URL.createObjectURL(new Blob([exportPreset(name, $state.snapshot(s))], { type: 'application/json' }))
    const a = Object.assign(document.createElement('a'), { href: url, download: `${name.replace(/\W+/g, '-')}.json` })
    a.click()
    URL.revokeObjectURL(url)
  }
  async function upload(e: Event & { currentTarget: HTMLInputElement }) {
    const input = e.currentTarget
    const file = input.files?.[0]
    if (!file) return
    const r = importPreset(await file.text(), cat)
    if ('error' in r) notice = `Import failed: ${r.error}`
    else {
      pg.load(r.preset.setup)
      presetName = r.preset.name
      notice = `Imported "${r.preset.name}"`
    }
    input.value = ''
  }
  function setClass(i: number, id: string) {
    const h = s.heroes[i]
    h.classId = id || null
    h.healSegment = id === 'healer' ? (h.healSegment ?? 20) : null
    if (id) {
      const start = cat.classes[id]?.startingArtifact
      if (start && !h.artifacts.includes(start)) h.artifacts = [start, ...h.artifacts]
      const maxHp = isClassId(id) ? modifiersOf(id).maxHp : undefined
      if (maxHp) {
        h.maxHp = Math.round(DUNGEON_RULES.startHp * maxHp)
        h.hp = h.maxHp
      }
    }
  }
</script>

<section class="flex min-w-0 flex-col gap-3" aria-label="Setup">
  <h2 class={H2}>Setup</h2>

  <div class={CARD}>
    <div class="flex flex-wrap gap-2">
      <select class="{FIELD} grow" bind:value={pickedPreset} aria-label="Preset">
        <optgroup label="Scenarios">
          {#each SCENARIOS as sc, i (sc.name)}<option value="scenario:{i}">{sc.name}</option>{/each}
        </optgroup>
        {#if saved.length}
          <optgroup label="Saved in this browser">
            {#each saved as p, i (p.name)}<option value="saved:{i}">{p.name}</option>{/each}
          </optgroup>
        {/if}
      </select>
      <button class={BTN} onclick={loadPreset}>Load</button>
      <button class={BTN} onclick={() => pg.reset()}>Reset</button>
    </div>
    {#if pickedPreset.startsWith('scenario:')}<p class="text-xs text-text-muted">
        {SCENARIOS[Number(pickedPreset.split(':')[1])].note}
      </p>{/if}
    <div class="flex flex-wrap gap-2">
      <input class="{FIELD} grow" placeholder="Preset name" aria-label="Preset name" bind:value={presetName} />
      <button class={BTN} onclick={savePreset}>Save</button>
      <button class={BTN} onclick={download}>Export JSON</button>
      <label class="{BTN} inline-flex items-center"
        >Import JSON<input type="file" accept="application/json,.json" class="sr-only" onchange={upload} /></label
      >
    </div>
    {#if notice}<p class="text-xs text-warn" role="status">{notice}</p>{/if}
  </div>

  <div class={CARD}>
    <h3 class="text-sm font-semibold">Run</h3>
    <div class="grid grid-cols-2 gap-2 text-sm">
      <label class="flex flex-col gap-1"
        >Seed
        <span class="flex gap-1"
          ><input class="{FIELD} w-full" type="number" min="0" bind:value={s.seed} />
          <button class={BTN_SM} onclick={() => (s.seed = Math.floor(Math.random() * 1e9))} title="Pick another seed">New</button></span
        >
      </label>
      <label class="flex flex-col gap-1">Round<input class={FIELD} type="number" min="1" bind:value={s.round} /></label>
      <label class="flex flex-col gap-1"
        >Difficulty
        <select class={FIELD} bind:value={s.cfg.difficulty}
          >{#each DIFFICULTIES as d (d)}<option>{d}</option>{/each}</select
        >
      </label>
      <label class="flex flex-col gap-1"
        >Floors
        <select class={FIELD} bind:value={s.cfg.floors}
          >{#each FLOOR_COUNTS as f (f)}<option value={f}>{f}</option>{/each}</select
        >
      </label>
      <label class="flex flex-col gap-1"
        >Room
        <select class={FIELD} bind:value={s.room}><option>fight</option><option>elite</option><option>boss</option></select>
      </label>
      <label class="flex flex-col gap-1">Gold<input class={FIELD} type="number" min="0" bind:value={s.gold} /></label>
    </div>
    <p class="text-xs text-text-muted">
      Darts per visit {DUNGEON_RULES.dartsPerVisit} and {DUNGEON_RULES.slotsPerNumber} item per number are engine constants (DUNGEON_RULES), shown
      here, not editable.
    </p>
  </div>

  <div class={CARD}>
    <div class="flex items-center justify-between">
      <h3 class="text-sm font-semibold">Heroes ({s.heroes.length}/{DUNGEON_RULES.maxParty})</h3>
      <button class={BTN_SM} disabled={s.heroes.length >= DUNGEON_RULES.maxParty} onclick={() => s.heroes.push(newHero())}>Add hero</button>
    </div>
    {#each s.heroes as h, i (i)}
      <div class="flex flex-col gap-2 rounded-md border border-line bg-bg p-2" aria-label="Hero {i + 1}" role="group">
        <div class="flex items-center gap-2">
          <Sprite id={h.classId ?? ''} scale={2} />
          <strong class="text-sm">Hero {i + 1}</strong>
          <select
            class="{FIELD} grow"
            value={h.classId ?? ''}
            onchange={e => setClass(i, e.currentTarget.value)}
            aria-label="Class of hero {i + 1}"
          >
            <option value="">No class</option>
            {#each classRows as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
          </select>
          <button
            class={BTN_SM}
            disabled={s.heroes.length <= DUNGEON_RULES.minParty}
            onclick={() => s.heroes.splice(i, 1)}
            aria-label="Remove hero {i + 1}">Remove</button
          >
        </div>
        {#if h.classId}<p class="text-xs text-text-muted">{cat.classes[h.classId]?.description}</p>{/if}
        <div class="grid grid-cols-3 gap-2 text-xs">
          <label class="flex flex-col gap-1">HP<input class={FIELD} type="number" min="0" bind:value={h.hp} /></label>
          <label class="flex flex-col gap-1">Max HP<input class={FIELD} type="number" min="1" bind:value={h.maxHp} /></label>
          <label class="flex flex-col gap-1">Block<input class={FIELD} type="number" min="0" bind:value={h.block} /></label>
          {#if h.classId === 'healer'}
            <label class="flex flex-col gap-1"
              >Heal number<input class={FIELD} type="number" min="1" max="20" bind:value={h.healSegment} /></label
            >
          {/if}
        </div>
        <HpRow hp={h.hp} maxHp={h.maxHp} colour={h.classId && isClassId(h.classId) ? CLASS_COLOR[h.classId] : undefined} />
        <div class="flex flex-wrap gap-1" aria-label="Hero {i + 1} artifacts">
          {#each h.artifacts as a (a)}
            {#if isArtifactId(a) && Object.hasOwn(SPRITES, a)}<ArtifactIcon id={a} owner="Hero {i + 1}" scale={2} />{/if}
          {/each}
        </div>
        <ContentPicker
          label="Artifacts"
          registry={cat.artifacts}
          chosen={h.artifacts}
          onchange={(ids: string[]) => {
            h.artifacts = ids
          }}
        />
      </div>
    {/each}
  </div>

  <div class={CARD}>
    <div class="flex items-center justify-between gap-2">
      <h3 class="text-sm font-semibold">Enemies ({s.enemies.length}/3)</h3>
      <div class="flex gap-1">
        <select class="{FIELD} h-7" bind:value={addEnemy} aria-label="Enemy to add">
          <option value="">Pick enemy</option>
          {#each enemyRows as e (e.id)}<option value={e.id}>{e.name}</option>{/each}
        </select>
        <button
          class={BTN_SM}
          disabled={!addEnemy || s.enemies.length >= 3}
          onclick={() => s.enemies.push(newEnemy(addEnemy, cat, s.heroes.length, s.cfg))}>Add</button
        >
      </div>
    </div>
    {#each s.enemies as e, i (i)}
      {@const entry = cat.enemies[e.kind]}
      <div class="flex flex-col gap-2 rounded-md border border-line bg-bg p-2" role="group" aria-label="Enemy {i + 1}">
        <div class="flex items-center justify-between">
          <span class="flex items-center gap-2"
            ><Sprite id={e.kind} scale={2} flip /><strong class="text-sm">{entry?.name ?? e.kind}</strong></span
          >
          <button class={BTN_SM} onclick={() => s.enemies.splice(i, 1)} aria-label="Remove enemy {i + 1}">Remove</button>
        </div>
        <div class="grid grid-cols-3 gap-2 text-xs">
          <label class="flex flex-col gap-1">HP<input class={FIELD} type="number" min="0" bind:value={e.hp} /></label>
          <label class="flex flex-col gap-1">Max HP<input class={FIELD} type="number" min="1" bind:value={e.maxHp} /></label>
          <label class="flex flex-col gap-1">Burn<input class={FIELD} type="number" min="0" bind:value={e.burn} /></label>
        </div>
        <label class="flex items-center gap-2 text-xs"
          ><input type="checkbox" bind:checked={e.chilled} /> Chilled (its next attack does less)</label
        >
        <HpRow hp={e.hp} maxHp={e.maxHp} />
        {#if entry}
          {@const intent = isEnemyId(e.kind) ? intentOf({ ...e, uid: `e${i}`, kind: e.kind }, s.round) : null}
          <p class="text-xs text-text-muted">
            Round {s.round} intent: {intent?.kind === 'attack'
              ? `attack ${intent.value}${intent.pierce ? ' (pierces block)' : ''}`
              : 'nothing'} · {entry.note}
          </p>
        {/if}
      </div>
    {/each}
  </div>

  <div class={CARD}>
    <h3 class="text-sm font-semibold">Board items ({s.items.length})</h3>
    <p class="text-xs text-text-muted">
      Pick “Place item” above the board and click a number. A number holds {DUNGEON_RULES.slotsPerNumber}.
    </p>
    <ul class="flex flex-wrap gap-1 p-0">
      {#each s.items as it, i (i)}
        <li
          class="flex items-center gap-1 rounded-md border border-line-2 bg-surface-2 px-2 py-1 text-xs"
          class:text-danger-text={itemsOn(it.number) > DUNGEON_RULES.slotsPerNumber}
        >
          {cat.items[it.item]?.name ?? it.item} on {it.number === 25 ? 'bull' : it.number}
          <button
            class="cursor-pointer border-0 bg-transparent text-text-muted"
            onclick={() => s.items.splice(i, 1)}
            aria-label="Remove {cat.items[it.item]?.name ?? it.item} from {it.number}">×</button
          >
        </li>
      {/each}
    </ul>
  </div>
</section>
