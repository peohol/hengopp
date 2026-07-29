import { z } from 'zod'
import { gridDefinitionSchema, DEFAULT_OBJECT_GRID } from './grid'

export const shapeSchema = z.enum(['rectangle', 'ellipse'])
export type Shape = z.infer<typeof shapeSchema>

export const anchorSchema = z.object({
  u: z.number().finite().min(0).max(1),
  v: z.number().finite().min(0).max(1),
})
export type Anchor = z.infer<typeof anchorSchema>

const colorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Ugyldig fargeverdi')

export const sceneObjectSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  shape: shapeSchema,
  xMm: z.number().finite(),
  yMm: z.number().finite(),
  widthMm: z.number().finite().positive(),
  heightMm: z.number().finite().positive(),
  fillColor: colorSchema,
  borderColor: colorSchema,
  /**
   * Fill opacity, 0–1. Documents written before the field existed are fully
   * opaque, so the schema default preserves their look; new objects instead
   * start at DEFAULT_OBJECT_OPACITY.
   */
  fillOpacity: z.number().finite().min(0).max(1).default(1),
  /**
   * A locked object cannot be moved, resized or have its distances toggled on
   * the canvas, and never joins alignment or distribution. Nothing else about
   * it is locked — it can still be edited, renamed, reordered and deleted.
   */
  locked: z.boolean().default(false),
  anchor: anchorSchema,
  internalGrid: gridDefinitionSchema,
  parentGroupId: z.string().nullable(),
  zIndex: z.number().finite(),
})

export type SceneObject = z.infer<typeof sceneObjectSchema>

/** Opacity a newly created object starts at. */
export const DEFAULT_OBJECT_OPACITY = 0.8

export const DEFAULT_ANCHOR: Anchor = { u: 0.5, v: 0.5 }

export const defaultInternalGrid = (): typeof DEFAULT_OBJECT_GRID => ({ ...DEFAULT_OBJECT_GRID })
