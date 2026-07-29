import { z } from 'zod'

/**
 * A user-placed guide line ("skillelinje") spanning the whole surface.
 *
 * The axis names the coordinate the line is fixed on, exactly like a snap
 * guide: `x` is a vertical line at `posMm` on the x axis, `y` is a horizontal
 * line at `posMm` on the y axis.
 */
export const guideAxisSchema = z.enum(['x', 'y'])
export type GuideAxis = z.infer<typeof guideAxisSchema>

export const guideLineSchema = z.object({
  id: z.string().min(1),
  axis: guideAxisSchema,
  posMm: z.number().finite(),
  /** A locked guide keeps its position until it is unlocked again. */
  locked: z.boolean().default(false),
})

export type GuideLine = z.infer<typeof guideLineSchema>

/** Which surface edge an exact guide position is measured from. */
export const guideOriginSchema = z.enum(['start', 'end'])
export type GuideOrigin = z.infer<typeof guideOriginSchema>
