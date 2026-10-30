<!--
  The X01 and Around the Clock match screen: the seats (panels, cards, rows or team panels by layout),
  the board, this visit, the dart slots and the controls. GameDisplay plays it; the big screen shows it
  `viewOnly`, with nothing to press and no waiting or entry states.
-->
<script lang="ts">
  import { whoOf } from '$lib/face'
  import type { Segment } from '$lib/api'
  import BoardCaption from './BoardCaption.svelte'
  import BoardLegend from './BoardLegend.svelte'
  import BoardViewToggle from './BoardViewToggle.svelte'
  import BoardOrKeypad from './match/BoardOrKeypad.svelte'
  import MatchFrame from './match/MatchFrame.svelte'
  import ControlBar from './ControlBar.svelte'
  import DartSlots from './DartSlots.svelte'
  import OfflineNotice from './OfflineNotice.svelte'
  import TurnStatusBar from './TurnStatusBar.svelte'
  import VisitBand from './VisitBand.svelte'
  import WaitingCard from './WaitingCard.svelte'
  import AtcCard from './AtcCard.svelte'
  import AtcPanel from './AtcPanel.svelte'
  import AtcRow from './AtcRow.svelte'
  import PhoneAtcCard from './PhoneAtcCard.svelte'
  import PhonePlayerRow from './PhonePlayerRow.svelte'
  import PhoneX01Card from './PhoneX01Card.svelte'
  import TeamPanel from './TeamPanel.svelte'
  import X01Card from './X01Card.svelte'
  import X01Panel from './X01Panel.svelte'
  import X01Row from './X01Row.svelte'
  import type { CameraVersions } from '$lib/camera'
  import type { GameSettings } from '$lib/gameSettings'
  import type { MatchLayout } from '$lib/matchLayout'
  import type { matchView } from '$lib/matchView'
  import { x01Roll } from '$lib/playerStats'
  import { boardCaption, rowSub, seatLines, turnStatus, type CenterState } from '$lib/remote'
  import type { Snapshot } from '$lib/ws'
  import { isWide } from '$lib/viewport'

  const noop = () => {}
  let {
    snapshot,
    mv,
    layout,
    settings = $bindable(),
    remote = { kind: 'play' },
    keypad = false,
    canThrow = false,
    locked = false,
    canUndo = false,
    next = { label: '', prominent: false, enabled: false },
    cameraSrc = null,
    cameraVersions = {},
    correcting = $bindable(null),
    viewOnly = false,
    onUndo = noop,
    onNext = noop,
    onDart = noop,
    onCorrect,
    onBoardClick = noop,
    onDartMove = noop,
    onabort = noop,
  }: {
    snapshot: Snapshot
    /** The derivations for this snapshot (lib/matchView.ts). */
    mv: ReturnType<typeof matchView>
    layout: MatchLayout
    settings: GameSettings
    /** Remote games: where the thrower is, and what the centre shows when it isn't you. */
    remote?: CenterState
    /** The Enter view: the keypad takes the board's place. */
    keypad?: boolean
    canThrow?: boolean
    locked?: boolean
    canUndo?: boolean
    next?: { label: string; prominent: boolean; enabled: boolean }
    cameraSrc?: string | null
    cameraVersions?: CameraVersions
    /** The dart open in the correction popover; also highlighted on the board. */
    correcting?: number | null
    /** No controls, no entry, nothing to tap: the big screen. */
    viewOnly?: boolean
    onUndo?: () => void
    onNext?: () => void
    onDart?: (segment: Segment) => void
    /** Without it the slots can't be tapped; the keypad's key with a dart selected goes through it too. */
    onCorrect?: (dartIndex: number, label: string) => void
    onBoardClick?: (hit: { segment: Segment; coords: { x: number; y: number } }) => void
    onDartMove?: (dartIndex: number, hit: { segment: Segment; coords: { x: number; y: number } }) => void
    onabort?: () => void
  } = $props()

  const players = $derived(snapshot.players)
  const isX01 = $derived(snapshot.gameId === 'x01')
  const isActive = $derived(snapshot.status === 'active')
  const game = $derived(snapshot.gameId === 'x01' || snapshot.gameId === 'atc' ? snapshot.game : null)
  const currentPlayer = $derived(game?.currentPlayer ?? 0)
  const darts = $derived(game?.currentVisitDarts ?? [])
  // A kiosk has no viewer: no "Garage · manual entry" lines under the names
  const lines = $derived(viewOnly ? snapshot.seats.map(() => null) : seatLines(snapshot))
  const who = $derived(whoOf(snapshot))
  const turn = $derived(turnStatus(remote))
  const caption = $derived(boardCaption(remote))
  const {
    teams,
    x01Players: x01All,
    atcPlayers,
    slots,
    band,
    visitKey,
    popIndex,
    checkoutTargets,
    boardTarget,
    boardNext,
    markers,
    legend,
    nextPlayer,
  } = $derived(mv)
  // On the big screen the thrower's own card doesn't say "Can finish": the dart slots and the board already show the route
  const x01Players = $derived(viewOnly && isActive ? x01All.map((p, i) => (i === currentPlayer ? { ...p, canFinish: null } : p)) : x01All)
  const pillFor = (i: number, rows: boolean) => mv.pillFor(i, rows)
  // Portrait with teams or three or more: compact cards above the board, which give way to a waiting card
  const portraitCards = $derived(layout === 'portrait' && (teams.length > 0 || players.length > 2))
  // On a phone the players stay in seat order; when the turn passes, keep the thrower in view
  let phonePlayers = $state<HTMLDivElement | undefined>()
  // Changes when the turn passes or the view switches; the thrower's entry carries it
  const upKey = $derived(`${currentPlayer}-${keypad ? 'entry' : 'board'}`)
  $effect(() => {
    phonePlayers?.querySelector(`[data-up="${upKey}"]`)?.scrollIntoView({ block: 'nearest' })
  })
  // Around the players and the board: tighter in the tablet band (md up to xl)
  const mainPad = 'px-5 py-[18px] gap-[18px] xl:px-7 xl:py-6 xl:gap-6'
  // Party rows: the X01 thrower's row is taller; rows keep a minimum height and scroll
  const rowTemplate = $derived(
    players
      .map((_, i) => (!isX01 ? 'minmax(110px, 1fr)' : isActive && i === currentPlayer ? 'minmax(150px, 1.55fr)' : 'minmax(96px, 1fr)'))
      .join(' '),
  )
</script>

{#snippet controls(compact: boolean)}
  <!-- Someone else's turn: their status; yours: Undo and Next. Nothing on a screen nobody plays on -->
  {#if !viewOnly}
    {#if turn}
      <TurnStatusBar status={turn} {compact} />
    {:else}
      <ControlBar {compact} {canUndo} label={next.label} prominent={next.prominent} enabled={next.enabled} {onUndo} {onNext} />
    {/if}
  {/if}
{/snippet}

{#snippet waitingCard(compact: boolean)}
  {#if remote.kind === 'waiting'}
    <WaitingCard name={remote.name} disconnectedAt={remote.disconnectedAt} canAbort={remote.canAbort} {onabort} {compact} />
  {/if}
{/snippet}

{#snippet board(minHeight: string, maxWidth: string, keypadClass = 'min-h-0', onKey = false)}
  <BoardOrKeypad
    keypad={onKey}
    {darts}
    {canThrow}
    {locked}
    {canUndo}
    {next}
    {onUndo}
    {onNext}
    {onBoardClick}
    onDart={canThrow ? onDart : noop}
    {onCorrect}
    bind:openDart={correcting}
    board={{
      dim: !isX01,
      target: boardTarget,
      nextTarget: boardNext,
      playerMarkers: markers,
      checkoutTargets: isActive ? checkoutTargets : [],
      onDartMove: canThrow ? onDartMove : undefined,
      cameraSrc,
    }}
    class={minHeight}
    square={maxWidth}
    {keypadClass}
  >
    {#snippet over()}{#if !viewOnly}<BoardViewToggle bind:settings {snapshot} {cameraVersions} />{/if}{/snippet}
  </BoardOrKeypad>
{/snippet}

{#snippet keypadView(keypadClass: string)}{@render board('', '', keypadClass, true)}{/snippet}

{#snippet portraitCenter()}
  <!-- Portrait (Match-Vertical): this visit and the slots in one strip, the controls, then the board fills the rest -->
  {#if remote.kind === 'play-offline'}<OfflineNotice board={remote.board} />{/if}
  <div class="shrink-0 grid gap-[10px] items-start {settings.visitSum ? 'grid-cols-[minmax(0,1.15fr)_minmax(0,3fr)]' : 'grid-cols-1'}">
    {#if settings.visitSum}<VisitBand {band} visit={visitKey} compact />{/if}
    <DartSlots {slots} {popIndex} {onCorrect} bind:openDart={correcting} />
  </div>
  {#if keypad}
    {@render keypadView('min-h-0')}
  {:else}
    {@render controls(false)}
    {#if remote.kind === 'waiting' && portraitCards}
      <!-- The cards have no room for it: the waiting card takes the board's place -->
      <div class="flex-1 min-h-0 flex rounded-[16px] bg-surface-panel border border-line-2">{@render waitingCard(false)}</div>
    {:else}
      {#if caption}<BoardCaption {caption} />{/if}
      {@render board('min-h-[200px]', '')}
      {#if legend.length}<BoardLegend items={legend} />{/if}
    {/if}
  {/if}
{/snippet}

{#snippet phoneCenter()}
  {#if remote.kind === 'play-offline'}<OfflineNotice board={remote.board} compact />{/if}
  <!-- Phones: everything fits without scrolling; the board, keypad or waiting card takes what's left -->
  {#if remote.kind === 'waiting'}
    <div class="flex-1 min-h-[160px] flex rounded-[16px] bg-surface-panel border border-line-2">{@render waitingCard(true)}</div>
  {:else if !keypad}
    {#if caption}<BoardCaption {caption} compact />{/if}
    {@render board('min-h-[160px]', '')}
  {/if}
  <!-- relative: the board view's correction picker opens above this row, over the board, full width -->
  <div class="relative shrink-0 grid gap-2 items-start {settings.visitSum ? 'grid-cols-[minmax(0,3fr)_minmax(0,1fr)]' : 'grid-cols-1'}">
    <DartSlots {slots} {popIndex} {onCorrect} bind:openDart={correcting} showPopover={!keypad} popoverAbove />
    {#if settings.visitSum}<VisitBand {band} visit={visitKey} compact />{/if}
  </div>
  {#if keypad}
    {@render keypadView('min-h-[220px]')}
  {:else}
    {@render controls(true)}
  {/if}
{/snippet}

{#snippet center(variant: 'solo' | 'duel' | 'party')}
  {#if remote.kind === 'play-offline'}<OfflineNotice board={remote.board} />{/if}
  {#if keypad}
    {@render keypadView('min-h-0')}
  {:else if remote.kind === 'waiting' && variant === 'party'}
    <!-- Rows have no room for an overlay: the waiting card takes the board's place -->
    <div class="flex-1 min-h-0 flex rounded-[16px] bg-surface-panel border border-line-2">{@render waitingCard(false)}</div>
  {:else}
    {#if caption}<BoardCaption {caption} />{/if}
    {@render board('min-h-0', variant === 'duel' ? 'max-w-[400px] xl:max-w-none' : '')}
    {#if legend.length}<BoardLegend items={legend} />{/if}
  {/if}

  {#if variant === 'solo'}
    <div class="grid grid-cols-[minmax(0,3fr)_minmax(0,1fr)] gap-[10px] items-start">
      <DartSlots {slots} {popIndex} {onCorrect} bind:openDart={correcting} />
      {#if settings.visitSum}<VisitBand {band} visit={visitKey} compact />{/if}
    </div>
  {:else}
    {#if settings.visitSum}<VisitBand {band} visit={visitKey} />{/if}
    <DartSlots {slots} {popIndex} {onCorrect} bind:openDart={correcting} />
  {/if}

  {#if !keypad}
    {@render controls(false)}
  {/if}
{/snippet}

{#snippet seatWaiting()}
  <!-- Below xl the two-player panels are 300 px: the compact card -->
  {@render waitingCard(!$isWide)}
{/snippet}

{#snippet panel(i: number)}
  {@const isWaiting = remote.kind === 'waiting' && remote.seat === i}
  {#if isX01}
    <X01Panel
      who={who[i]}
      p={x01Players[i]}
      active={i === currentPlayer && isActive}
      solo={layout === 'solo'}
      portrait={layout === 'portrait'}
      pill={pillFor(i, false)}
      seat={lines[i] ?? null}
      chalkboard={settings.chalkboard}
      waiting={isWaiting ? seatWaiting : undefined}
    />
  {:else}
    <AtcPanel
      who={who[i]}
      p={atcPlayers[i]}
      active={i === currentPlayer && isActive}
      solo={layout === 'solo'}
      portrait={layout === 'portrait'}
      pill={pillFor(i, false)}
      seat={lines[i] ?? null}
      waiting={isWaiting ? seatWaiting : undefined}
    />
  {/if}
{/snippet}

{#snippet duelPanel(i: number)}
  <!-- Tablets: a fixed 300 px panel; desktops lay the panel out as if the wrapper weren't there -->
  <div class="w-[300px] shrink-0 min-w-0 min-h-0 flex xl:contents">
    {@render panel(i)}
  </div>
{/snippet}

{#snippet teamWaiting()}{@render waitingCard(false)}{/snippet}

{#snippet teamPanel(t: number, compact: boolean)}
  {@const team = teams[t]}
  {#if team}
    <!-- A disconnected thrower's team: the waiting card covers the score, below the players
         (compact panels have no room: the board's place shows it instead) -->
    {@const awaySeat = remote.kind === 'waiting' ? remote.seat : null}
    {@const away = team.members.some(m => m.seat === awaySeat)}
    <TeamPanel
      {team}
      seats={lines}
      {who}
      chalkboard={settings.chalkboard && !compact}
      {compact}
      overlay={away && !compact ? teamWaiting : undefined}
    />
  {/if}
{/snippet}

{#snippet phoneLayout()}
  <!-- Everyone in seat order; the thrower's entry is the active one (card on the board, a row with the keypad).
           Many players scroll, and the thrower is kept in view. -->
  <div bind:this={phonePlayers} class="shrink-0 max-h-[55%] overflow-y-auto flex flex-col gap-2">
    {#if teams.length}
      <!-- Teams: side by side, compact; with the keypad on a short screen only the throwing team's -->
      <div class="grid grid-cols-2 gap-2 items-stretch">
        {#each teams as team, t (team.id)}
          <div
            data-up={team.active ? upKey : undefined}
            class="flex min-w-0 {!team.active && keypad ? '[@media(max-height:599px)]:hidden' : ''}"
          >
            {@render teamPanel(t, true)}
          </div>
        {/each}
      </div>
    {:else}
      {#each who as _, i (i)}
        {@const up = i === currentPlayer}
        {@const line = lines[i] ?? null}
        <div data-up={up ? upKey : undefined} class={!up && keypad ? '[@media(max-height:599px)]:hidden' : ''}>
          {#if up && !keypad}
            {#if isX01}
              <PhoneX01Card who={who[i]} p={x01Players[i]} pill={pillFor(i, false)} seat={line} chalkboard={settings.chalkboard} />
            {:else}
              <PhoneAtcCard who={who[i]} p={atcPlayers[i]} pill={pillFor(i, false)} seat={line} />
            {/if}
          {:else if isX01}
            <PhonePlayerRow
              active={up}
              who={who[i]}
              you={line?.you ?? false}
              pill={up ? null : pillFor(i, true)}
              sub={rowSub(
                up
                  ? x01Players[i]?.canFinish
                    ? `Throwing · can finish ${x01Players[i]?.canFinish}`
                    : 'Throwing'
                  : i === nextPlayer
                    ? x01Players[i]?.canFinish
                      ? `Up next · can finish ${x01Players[i]?.canFinish}`
                      : 'Up next'
                    : `Avg ${x01Players[i]?.avg ?? '0.0'}`,
                line,
              )}
              valueLabel="Left"
              value={String(x01Players[i]?.shown ?? '')}
              roll={x01Players[i] ? x01Roll(x01Players[i]) : {}}
              legs={{ total: x01Players[i]?.firstTo ?? 1, won: x01Players[i]?.legsWon ?? 0 }}
            />
          {:else}
            <PhonePlayerRow
              active={up}
              who={who[i]}
              you={line?.you ?? false}
              pill={up ? null : pillFor(i, true)}
              sub={rowSub(
                up
                  ? `${atcPlayers[i]?.done ?? 0} of ${atcPlayers[i]?.total ?? 0} done`
                  : i === nextPlayer
                    ? 'Up next'
                    : `${atcPlayers[i]?.done ?? 0} of ${atcPlayers[i]?.total ?? 0} done`,
                line,
              )}
              valueLabel="Target"
              value={atcPlayers[i]?.target ?? ''}
              roll={{ normal: 'up', progress: atcPlayers[i]?.done }}
            />
          {/if}
        </div>
      {/each}
    {/if}
  </div>
  <div class="flex-1 min-h-0 flex flex-col gap-2">{@render phoneCenter()}</div>
{/snippet}

{#snippet portraitLayout()}
  <!-- The players side by side on top (many scroll, the thrower kept in view), the board below -->
  <div
    bind:this={phonePlayers}
    class="shrink-0 max-h-[45%] overflow-y-auto grid gap-3 lg:gap-4 {players.length === 1 && !teams.length ? 'grid-cols-1' : 'grid-cols-2'}"
  >
    {#if teams.length}
      {#each teams as team, t (team.id)}
        <div data-up={team.active ? upKey : undefined} class="flex min-w-0">{@render teamPanel(t, true)}</div>
      {/each}
    {:else}
      {#each who as _, i (i)}
        <div data-up={i === currentPlayer ? upKey : undefined} class="flex min-w-0">
          {#if !portraitCards}
            {@render panel(i)}
          {:else if isX01}
            <X01Card
              who={who[i]}
              p={x01Players[i]}
              active={i === currentPlayer && isActive}
              pill={pillFor(i, true)}
              seat={lines[i] ?? null}
            />
          {:else}
            <AtcCard
              who={who[i]}
              p={atcPlayers[i]}
              active={i === currentPlayer && isActive}
              pill={pillFor(i, true)}
              seat={lines[i] ?? null}
            />
          {/if}
        </div>
      {/each}
    {/if}
  </div>
  {@render portraitCenter()}
{/snippet}

{#snippet soloLayout()}
  {@render panel(0)}
  <div class="flex-1 min-w-[380px] min-h-0 flex flex-col gap-3">{@render center('solo')}</div>
{/snippet}

{#snippet teamsLayout()}
  <div class="col-start-1 row-start-1 min-w-0 min-h-0 flex">{@render teamPanel(0, !$isWide)}</div>
  <div class="col-start-2 row-start-1 min-h-0 flex flex-col gap-3 {$isWide ? '' : 'row-span-2'}">
    {@render center($isWide ? 'duel' : 'party')}
  </div>
  <div class="min-w-0 min-h-0 flex {$isWide ? 'col-start-3 row-start-1' : 'col-start-1 row-start-2'}">
    {@render teamPanel(1, !$isWide)}
  </div>
{/snippet}

{#snippet duelLayout()}
  {@render duelPanel(0)}
  <div class="flex-1 min-w-0 xl:w-[560px] xl:flex-none min-h-0 flex flex-col gap-[10px] xl:gap-3">{@render center('duel')}</div>
  {@render duelPanel(1)}
{/snippet}

{#snippet partyLayout()}
  <div class="flex-1 min-w-0 min-h-0 grid gap-3 overflow-y-auto" style:grid-template-rows={rowTemplate}>
    {#each who as _, i (i)}
      {#if isX01}
        <X01Row who={who[i]} p={x01Players[i]} active={i === currentPlayer && isActive} pill={pillFor(i, true)} seat={lines[i] ?? null} />
      {:else}
        <AtcRow who={who[i]} p={atcPlayers[i]} active={i === currentPlayer && isActive} pill={pillFor(i, true)} seat={lines[i] ?? null} />
      {/if}
    {/each}
  </div>
  <aside class="w-[400px] xl:w-[480px] shrink-0 min-h-0 flex flex-col gap-3" aria-label="Board">{@render center('party')}</aside>
{/snippet}

<MatchFrame
  {layout}
  phone={phoneLayout}
  portrait={portraitLayout}
  solo={soloLayout}
  teams={teamsLayout}
  duel={duelLayout}
  party={partyLayout}
  phoneScroll={false}
  side={{
    duel: `${mainPad} flex`,
    party: `${mainPad} flex`,
    teams: `px-7 py-6 grid gap-6 ${$isWide ? 'grid-cols-[minmax(0,1fr)_560px_minmax(0,1fr)] grid-rows-1' : 'grid-cols-[minmax(0,1fr)_480px] grid-rows-2'}`,
  }}
/>
