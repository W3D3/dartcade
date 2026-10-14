// The hole editor's tools (routes/MinigolfHoleEditor.svelte): the rail's order, keys and hints,
// and the options the Properties panel sets for placing new elements.

export type Tool = 'select' | 'outline' | 'tee' | 'cup' | 'bumper' | 'wall' | 'terrain'

export const TOOLS: { id: Tool; label: string; key: string; hint: string }[] = [
  { id: 'select', label: 'Select', key: 'V', hint: 'Click anything to select it · drag to move · Delete removes' },
  { id: 'outline', label: 'Outline', key: 'O', hint: 'Drag corners · click ● to add a corner · Shift draws freely' },
  { id: 'tee', label: 'Tee', key: 'T', hint: 'Drag the tee box · one tee per hole' },
  { id: 'cup', label: 'Cup', key: 'C', hint: 'Drag the cup · one cup per hole' },
  { id: 'bumper', label: 'Bumper', key: 'B', hint: 'Click on the felt to place a bumper' },
  { id: 'wall', label: 'Wall', key: 'W', hint: 'Drag to draw a wall · snaps to 45°' },
  { id: 'terrain', label: 'Terrain', key: 'R', hint: 'Click for a hill or dip · drag for a ridge or plateau' },
]

export type Brush = 'hill' | 'dip' | 'ridge' | 'plateau' | 'flatten'

export interface ToolOptions {
  bumperSize: 'S' | 'M' | 'L'
  bounce: 'soft' | 'normal' | 'strong'
  wallThickness: 'thin' | 'normal'
  brush: Brush
  /** 0..100: a share of MAX_HEIGHT. */
  strength: number
  /** Radius of a hill or dip, width of a ridge, mm. */
  brushSize: number
  rampSide: 'N' | 'E' | 'S' | 'W'
}

export const DEFAULT_OPTIONS: ToolOptions = {
  bumperSize: 'M',
  bounce: 'normal',
  wallThickness: 'normal',
  brush: 'hill',
  strength: 40,
  brushSize: 400,
  rampSide: 'S',
}

/** The height (or depth) a full-strength terrain brush makes, mm. */
export const MAX_HEIGHT = 200

export const heightOf = (o: ToolOptions) => Math.round((o.strength / 100) * MAX_HEIGHT)
