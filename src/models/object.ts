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
  anchor: anchorSchema,
  internalGrid: gridDefinitionSchema,
  parentGroupId: z.string().nullable(),
  zIndex: z.number().finite(),
})

export type SceneObject = z.infer<typeof sceneObjectSchema>

export const DEFAULT_ANCHOR: Anchor = { u: 0.5, v: 0.5 }

export const defaultInternalGrid = (): typeof DEFAULT_OBJECT_GRID => ({ ...DEFAULT_OBJECT_GRID })
