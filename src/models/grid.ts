import { z } from 'zod'

/**
 * A grid is either a regular cell grid (integer or decimal cell counts) or the
 * golden-ratio guide set. Decimal cell counts produce one truncated cell whose
 * placement is controlled by the alignment (implemented as a phase shift of a
 * conceptually infinite grid).
 */
export const gridAlignSchema = z.enum(['start', 'center', 'end'])
export type GridAlign = z.infer<typeof gridAlignSchema>

export const gridModeSchema = z.enum(['cells', 'golden'])
export type GridMode = z.infer<typeof gridModeSchema>

export const gridDefinitionSchema = z.object({
  enabled: z.boolean(),
  mode: gridModeSchema,
  /** Horizontal cell count, >= 1, decimals allowed. */
  cols: z.number().finite().min(1),
  /** Vertical cell count, >= 1, decimals allowed. */
  rows: z.number().finite().min(1),
  hAlign: gridAlignSchema,
  vAlign: gridAlignSchema,
})

export type GridDefinition = z.infer<typeof gridDefinitionSchema>

export const DEFAULT_SURFACE_GRID: GridDefinition = {
  enabled: false,
  mode: 'cells',
  cols: 3,
  rows: 2,
  hAlign: 'start',
  vAlign: 'start',
}

export const DEFAULT_OBJECT_GRID: GridDefinition = {
  enabled: true,
  mode: 'cells',
  cols: 2,
  rows: 2,
  hAlign: 'start',
  vAlign: 'start',
}

export type GridPreset = {
  id: string
  label: string
  cols: number
  rows: number
  mode: GridMode
}

export const GRID_PRESETS: GridPreset[] = [
  { id: '1x1', label: '1 × 1', cols: 1, rows: 1, mode: 'cells' },
  { id: '2x2', label: '2 × 2', cols: 2, rows: 2, mode: 'cells' },
  { id: '3x2', label: '3 × 2', cols: 3, rows: 2, mode: 'cells' },
  { id: '5x4', label: '5 × 4', cols: 5, rows: 4, mode: 'cells' },
  { id: 'golden', label: 'Gylne snitt', cols: 1, rows: 1, mode: 'golden' },
]
