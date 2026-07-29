import { z } from 'zod'
import { gridDefinitionSchema, DEFAULT_SURFACE_GRID } from './grid'
import { sceneObjectSchema } from './object'
import { objectGroupSchema } from './group'
import { guideLineSchema } from './guide'
import { measureLineSchema } from './measure'

export const SCHEMA_VERSION = 2

export const unitSchema = z.enum(['cm', 'mm'])
export type Unit = z.infer<typeof unitSchema>

export const surfaceSchema = z.object({
  widthMm: z.number().finite().positive(),
  heightMm: z.number().finite().positive(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
})
export type SurfaceDefinition = z.infer<typeof surfaceSchema>

export const measurementSideSchema = z.enum(['left', 'right', 'top', 'bottom'])
export type MeasurementSide = z.infer<typeof measurementSideSchema>

export const pinnedMeasurementSchema = z.object({
  id: z.string().min(1),
  /** Id of the object or group the measurement belongs to. */
  objectId: z.string().min(1),
  side: measurementSideSchema,
})
export type PinnedMeasurement = z.infer<typeof pinnedMeasurementSchema>

/**
 * Zero point of the rulers, in model millimetres. It only changes what the
 * rulers read out — never the geometry, and never the coordinates in the menu,
 * which stay relative to the surface. Unlike a guide it may sit outside the
 * surface, since measuring from a point off the wall is a normal thing to want.
 */
export const rulerOriginSchema = z.object({
  xMm: z.number().finite(),
  yMm: z.number().finite(),
})
export type RulerOrigin = z.infer<typeof rulerOriginSchema>

export const DEFAULT_RULER_ORIGIN: RulerOrigin = { xMm: 0, yMm: 0 }

export const settingsSchema = z.object({
  movementStepMm: z.number().finite().positive(),
  snapToGrid: z.boolean(),
  snapToObjects: z.boolean(),
  /**
   * Quantise free drag – both position and size – to the movement step.
   * On by default: the canvas gives round changes, and exact values are typed
   * into the position and size fields in the menu.
   */
  quantiseDrag: z.boolean().default(true),
})
export type ProjectSettings = z.infer<typeof settingsSchema>

export const projectSchema = z.object({
  schemaVersion: z.number().int().positive(),
  id: z.string().min(1),
  name: z.string().min(1),
  displayUnit: unitSchema,
  surface: surfaceSchema,
  surfaceGrid: gridDefinitionSchema,
  objects: z.record(sceneObjectSchema),
  groups: z.record(objectGroupSchema),
  pinnedMeasurements: z.array(pinnedMeasurementSchema),
  /** User-placed guide lines other objects can snap to. */
  guides: z.array(guideLineSchema).default([]),
  /** Free measuring lines drawn with the measure tool. */
  measureLines: z.array(measureLineSchema).default([]),
  rulerOrigin: rulerOriginSchema.default(DEFAULT_RULER_ORIGIN),
  settings: settingsSchema,
  /** True until the user has completed the first-run surface setup. */
  isDraftSetup: z.boolean().default(false),
})

export type HengoppProject = z.infer<typeof projectSchema>

export const DEFAULT_SURFACE: SurfaceDefinition = {
  widthMm: 3000,
  heightMm: 2400,
  color: '#f2f0ec',
}

export function createEmptyProject(id: string): HengoppProject {
  return {
    schemaVersion: SCHEMA_VERSION,
    id,
    name: 'Nytt prosjekt',
    displayUnit: 'cm',
    surface: { ...DEFAULT_SURFACE },
    surfaceGrid: { ...DEFAULT_SURFACE_GRID },
    objects: {},
    groups: {},
    pinnedMeasurements: [],
    guides: [],
    measureLines: [],
    rulerOrigin: { ...DEFAULT_RULER_ORIGIN },
    settings: {
      movementStepMm: 10,
      snapToGrid: true,
      snapToObjects: true,
      quantiseDrag: true,
    },
    isDraftSetup: true,
  }
}
