import { z } from 'zod'
import { gridDefinitionSchema, DEFAULT_SURFACE_GRID } from './grid'
import { sceneObjectSchema } from './object'
import { objectGroupSchema } from './group'

export const SCHEMA_VERSION = 1

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

export const settingsSchema = z.object({
  movementStepMm: z.number().finite().positive(),
  snapToGrid: z.boolean(),
  snapToObjects: z.boolean(),
  /** Quantise free drag to the movement step. Off by default (continuous drag + snapping). */
  quantiseDrag: z.boolean().default(false),
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
    settings: {
      movementStepMm: 10,
      snapToGrid: true,
      snapToObjects: true,
      quantiseDrag: false,
    },
    isDraftSetup: true,
  }
}
